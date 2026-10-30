// Composition root: builds the store, providers and runner from config. Tests pass overrides
// (fixture LLM, search and fetcher); production reads everything from .env through src/config.js.
import { loadConfig } from './config.js';
import { FileStudyStore } from './store/study-store.js';
import { createSearch } from './providers/search/index.js';
import { createLLM } from './providers/llm/index.js';
import { createFetcher } from './providers/fetch/fetcher.js';
import { Runner } from './core/runner.js';

import { PERSPECTIVES, DEPTHS } from './core/inputs.js';

export { PERSPECTIVES, DEPTHS };

export function createHarness({ config = loadConfig(), store, llm, search, fetcher, findNewer } = {}) {
  const deps = {
    config,
    store: store || new FileStudyStore(config.dataDir),
    llm: llm || createLLM(config),
    search: search || createSearch(config),
    fetcher: fetcher || createFetcher({ contact: config.fetchContact }),
    findNewer,
  };
  const runner = new Runner(deps);
  return { ...deps, runner, createStudy: (inputs) => createStudy(deps.store, inputs) };
}

/**
 * Validate inputs and create a study record. "Subject" is the company studied; "me" is the reader's company.
 * Only the question is required: the understand stage works out any of subject, me, perspective, geography and period left blank.
 */
export async function createStudy(store, raw) {
  const errors = [];
  const inputs = {
    question: String(raw?.question || '').trim(),
    title: raw?.title ? String(raw.title).trim() : null,
    perspective: raw?.perspective ? String(raw.perspective) : null,
    subject: { name: String(raw?.subject?.name || raw?.subject || '').trim() },
    me: raw?.me?.name || typeof raw?.me === 'string' ? { name: String(raw.me?.name || raw.me).trim() } : null,
    geography: String(raw?.geography || '').trim(),
    period: String(raw?.period || '').trim(),
    depth: String(raw?.depth || 'Standard'),
    force_full_redo: Boolean(raw?.force_full_redo),
  };
  if (!inputs.question) errors.push('question is required');
  if (inputs.perspective && !PERSPECTIVES.includes(inputs.perspective)) errors.push(`perspective must be one of ${PERSPECTIVES.join(', ')}`);
  if (!DEPTHS.includes(inputs.depth)) errors.push(`depth must be one of ${DEPTHS.join(', ')}`);
  if (errors.length) {
    const e = new Error(errors.join('; '));
    e.code = 'invalid_input';
    throw e;
  }
  return store.create({
    inputs,
    state: 'created',
    stage: null,
    cursor: null,
    stages: {},
    sources: [],
    search_log: [],
    claims: [],
    contradictions: [],
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, searches: 0, pages: 0 },
  });
}
