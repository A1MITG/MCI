// Claude adapter. Stable instructions go in a cached system block; per-study content goes in the user turn,
// so the cache prefix stays identical across calls of the same stage.
import Anthropic from '@anthropic-ai/sdk';
import { runError } from '../../core/errors.js';

export function anthropicLLM({ key, models, client }) {
  let sdk = client;
  const getClient = () => {
    if (sdk) return sdk;
    if (!key) throw runError('config_error', 'LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set in .env');
    sdk = new Anthropic({ apiKey: key, maxRetries: 0 }); // the harness owns retries
    return sdk;
  };

  return {
    name: 'anthropic',
    async json({ stage, tier = 'strong', effort = 'medium', system, user, schema, signal, maxTokens = 32000 }) {
      const model = models[tier] || models.strong;
      const params = {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      };
      // Server-side refusal fallback on the Opus tier (routes a policy decline to a fallback model in the same call).
      const withFallback = model.startsWith('claude-opus');
      if (withFallback) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
      const sdkClient = getClient();
      let msg;
      try {
        const api = withFallback ? sdkClient.beta.messages : sdkClient.messages;
        msg = await api.stream(params, { signal }).finalMessage();
      } catch (e) {
        throw mapError(e, stage);
      }
      if (msg.stop_reason === 'refusal') throw runError('refused', `Model declined the ${stage} request`, { stage });
      if (msg.stop_reason === 'max_tokens') throw runError('invalid_json', `Output hit max_tokens in ${stage}`, { stage });
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw runError('invalid_json', `Model returned invalid JSON in ${stage}`, { stage });
      }
      return { data, usage: { ...msg.usage, model } };
    },
  };
}

function mapError(e, stage) {
  if (e instanceof Anthropic.RateLimitError) return runError('rate_limited', 'Claude rate limit', { stage, cause: e });
  if (e instanceof Anthropic.AuthenticationError) return runError('config_error', 'Invalid ANTHROPIC_API_KEY', { stage, cause: e });
  if (e instanceof Anthropic.BadRequestError) return runError('config_error', `Claude rejected the request: ${e.message}`, { stage, cause: e });
  if (e instanceof Anthropic.APIConnectionTimeoutError) return runError('timeout', 'Claude request timed out', { stage, cause: e });
  if (e instanceof Anthropic.APIUserAbortError) return runError('cancelled', 'Cancelled', { stage, cause: e });
  if (e instanceof Anthropic.APIError) return runError('provider_error', `Claude API error ${e.status}`, { stage, cause: e });
  return runError('provider_error', e.message, { stage, cause: e });
}
