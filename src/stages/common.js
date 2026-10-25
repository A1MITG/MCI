// Helpers shared by stages: model calls with recorded usage, output validation, ID assignment.
import { runError } from '../core/errors.js';
import { loadPrompt } from './prompts.js';

/** Call the model for a stage. Records prompt version and token usage on the study. */
export async function callModel(study, deps, stage, { vars, user, role = 'researcher' }) {
  const { config, llm, signal } = deps;
  const prompt = loadPrompt(config, stage, vars);
  deps.budget.checkTokens(study);
  const { data, usage } = await llm.json({
    stage,
    role,
    tier: config.harness.models.stageTier[stage],
    effort: config.harness.models.stageEffort[stage],
    system: prompt.text,
    user,
    signal,
  });
  study.usage = study.usage || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, searches: 0, pages: 0 };
  study.usage.input_tokens += usage?.input_tokens || 0;
  study.usage.output_tokens += usage?.output_tokens || 0;
  study.usage.cache_read_input_tokens += usage?.cache_read_input_tokens || 0;
  study.prompt_versions = { ...(study.prompt_versions || {}), [stage]: prompt.id };
  await deps.emit('model_call', { stage, prompt: prompt.id, usage });
  if (!data || typeof data !== 'object') throw runError('schema_invalid', `${stage}: model output is not an object`, { stage });
  return data;
}

/** Minimal shape check: throws a retryable schema error naming the missing fields. */
export function requireFields(stage, obj, fields) {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj?.[f] === null);
  if (missing.length) throw runError('schema_invalid', `${stage}: missing ${missing.join(', ')}`, { stage });
}

export const asArray = (v) => (Array.isArray(v) ? v : []);

export function nextId(prefix, existing) {
  const nums = existing.filter((id) => id?.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)) || 0);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

export function json(value) {
  return JSON.stringify(value, null, 1);
}
