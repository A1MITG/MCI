// OpenAI adapter (Chat Completions, JSON mode). Same json() interface as the Claude adapter, so stages
// don't know which provider runs. Model names come from config (models.openai) or OPENAI_MODEL_* in .env.
import { runError } from '../../core/errors.js';

const URL = 'https://api.openai.com/v1/chat/completions';

export function openaiLLM({ key, models, fetchImpl = fetch, timeoutMs = 300_000 }) {
  const names = models.openai;
  return {
    name: 'openai',
    async json({ stage, tier = 'strong', system, user, signal, maxTokens = 16000 }) {
      if (!key) throw runError('config_error', 'LLM_PROVIDER=openai but OPENAI_API_KEY is not set in .env', { stage });
      const model = names[tier] || names.strong;
      const body = {
        model,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };
      let res;
      try {
        res = await fetchImpl(URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
        });
      } catch (e) {
        if (signal?.aborted) throw runError('cancelled', 'Cancelled', { stage });
        throw runError(e.name === 'TimeoutError' ? 'timeout' : 'provider_error', `OpenAI request failed: ${e.message}`, { stage });
      }
      if (!res.ok) throw statusError(res.status, await res.text().catch(() => ''), stage);

      const out = await res.json();
      const choice = out.choices?.[0];
      if (choice?.message?.refusal) throw runError('refused', `Model declined the ${stage} request`, { stage });
      if (choice?.finish_reason === 'length') throw runError('invalid_json', `Output hit max tokens in ${stage}`, { stage });
      if (choice?.finish_reason === 'content_filter') throw runError('refused', `Output filtered in ${stage}`, { stage });
      let data;
      try {
        data = JSON.parse(choice?.message?.content ?? '');
      } catch {
        throw runError('invalid_json', `Model returned invalid JSON in ${stage}`, { stage });
      }
      const u = out.usage || {};
      return {
        data,
        usage: {
          input_tokens: u.prompt_tokens || 0,
          output_tokens: u.completion_tokens || 0,
          cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens || 0,
          model: out.model || model,
        },
      };
    },
  };
}

function statusError(status, text, stage) {
  const detail = text.slice(0, 300);
  if (status === 429) return runError('rate_limited', 'OpenAI rate limit or quota reached', { stage });
  if (status === 401 || status === 403) return runError('config_error', 'Invalid OPENAI_API_KEY or no access to the model', { stage });
  if (status === 400 || status === 404) return runError('config_error', `OpenAI rejected the request (${status}): ${detail}`, { stage });
  return runError('provider_error', `OpenAI API error ${status}`, { stage });
}
