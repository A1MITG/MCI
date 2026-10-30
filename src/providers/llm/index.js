// Model provider registry, chosen by LLM_PROVIDER in .env. Stages only see the `json()` interface:
//   json({stage, role, tier, effort, system, user, schema, signal}) -> {data, usage}
import { anthropicLLM } from './anthropic.js';
import { openaiLLM } from './openai.js';
import { fixtureLLM } from './fixture.js';

const REGISTRY = { anthropic: anthropicLLM, openai: openaiLLM, fixture: fixtureLLM };

export function createLLM(config, overrides = {}) {
  const factory = REGISTRY[config.providers.llm];
  if (!factory) throw new Error(`Unknown LLM_PROVIDER "${config.providers.llm}". Use one of: ${Object.keys(REGISTRY).join(', ')}`);
  return factory({ key: config.keys[config.providers.llm], models: config.harness.models, ...overrides });
}
