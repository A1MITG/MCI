// The only module that reads environment variables. Everything else receives config from here.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

export function loadConfig(env = process.env) {
  const harness = readJson('config/harness.config.json');
  harness.models.openai = {
    strong: env.OPENAI_MODEL_STRONG || harness.models.openai.strong,
    fast: env.OPENAI_MODEL_FAST || harness.models.openai.fast,
  };
  return {
    root: ROOT,
    harness,
    rubric: readJson('config/scoring-rubric.json'),
    sourceTiers: readJson('config/source-tiers.json'),
    frameworks: readJson('config/frameworks.json'),
    providers: {
      search: (env.SEARCH_PROVIDER || 'tavily').toLowerCase(),
      llm: (env.LLM_PROVIDER || 'anthropic').toLowerCase(),
    },
    keys: {
      anthropic: env.ANTHROPIC_API_KEY || '',
      openai: env.OPENAI_API_KEY || '',
      tavily: env.TAVILY_API_KEY || '',
      brave: env.BRAVE_API_KEY || '',
      exa: env.EXA_API_KEY || '',
    },
    dataDir: path.resolve(ROOT, env.DATA_DIR || 'data/studies'),
    port: Number(env.PORT || 3000),
    fetchContact: (env.FETCH_CONTACT_EMAIL || '').trim(),
  };
}

/** Tiny .env reader so the app needs no extra dependency. Variables already set in the environment win. */
export function loadDotEnv(file = path.join(ROOT, '.env'), env = process.env) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
