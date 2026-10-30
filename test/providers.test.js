import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config.js';
import { createSearch, SEARCH_PROVIDERS } from '../src/providers/search/index.js';
import { createLLM } from '../src/providers/llm/index.js';
import { openaiLLM } from '../src/providers/llm/openai.js';
import { robotsAllows, htmlToText } from '../src/providers/fetch/fetcher.js';

test('one setting picks the search provider', () => {
  for (const name of SEARCH_PROVIDERS) {
    const s = createSearch(loadConfig({ SEARCH_PROVIDER: name }));
    assert.equal(s.name, name);
  }
  assert.throws(() => createSearch(loadConfig({ SEARCH_PROVIDER: 'bing' })), /Unknown SEARCH_PROVIDER "bing"/);
});

test('a missing key fails loudly at call time, never falls back to mock data', async () => {
  const s = createSearch(loadConfig({ SEARCH_PROVIDER: 'tavily' }));
  await assert.rejects(s.search('x'), (e) => e.code === 'config_error');
  const llm = createLLM(loadConfig({ LLM_PROVIDER: 'anthropic' }));
  await assert.rejects(llm.json({ stage: 'scope', system: 's', user: 'u' }), (e) => e.code === 'config_error');
});

test('only src/config.js reads process.env', () => {
  const files = walk(path.resolve('src')).filter((f) => f.endsWith('.js') && !f.endsWith(path.join('src', 'config.js')));
  const offenders = files.filter((f) => /process\.env/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('.env loader does not override variables already set', () => {
  const env = { SEARCH_PROVIDER: 'brave' };
  loadDotEnv(path.resolve('.env.example'), env);
  assert.equal(env.SEARCH_PROVIDER, 'brave');
  assert.equal(env.LLM_PROVIDER, 'anthropic');
});

test('robots.txt is respected and HTML becomes text', () => {
  const robots = 'User-agent: *\nDisallow: /private\n';
  assert.equal(robotsAllows(robots, '/private/report'), false);
  assert.equal(robotsAllows(robots, '/public'), true);
  assert.equal(htmlToText('<p>Hello <b>world</b></p><script>alert(1)</script>'), 'Hello world');
});

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// ---- OpenAI adapter (no network: fetch is stubbed) ---------------------------------


const reply = (content, extra = {}) => async (url, init) => ({
  ok: true,
  status: 200,
  json: async () => ({ model: JSON.parse(init.body).model, choices: [{ message: { content }, finish_reason: 'stop', ...extra }], usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } } }),
});

test('LLM_PROVIDER=openai selects the OpenAI adapter with its own key and models', () => {
  const config = loadConfig({ LLM_PROVIDER: 'openai', OPENAI_MODEL_FAST: 'my-fast-model' });
  assert.equal(createLLM(config).name, 'openai');
  assert.equal(config.harness.models.openai.fast, 'my-fast-model');
  assert.equal(config.harness.models.openai.strong, 'gpt-4.1');
});

test('OpenAI adapter: JSON mode request, tiered model, usage mapped', async () => {
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, init }; return reply('{"ok": true}')(url, init); };
  const llm = openaiLLM({ key: 'k', models: loadConfig({}).harness.models, fetchImpl });
  const { data, usage } = await llm.json({ stage: 'validate', tier: 'fast', system: 'Reply in JSON.', user: 'u' });
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(data, { ok: true });
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages[0].role, 'system');
  assert.equal(sent.init.headers.authorization, 'Bearer k');
  assert.deepEqual(usage, { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 100, model: 'gpt-4.1-mini' });
});

test('OpenAI adapter: failures become typed errors, never mock data', async () => {
  const models = loadConfig({}).harness.models;
  const status = (s) => async () => ({ ok: false, status: s, text: async () => 'nope' });
  const code = async (fetchImpl, key = 'k') => openaiLLM({ key, models, fetchImpl }).json({ stage: 'scope', system: 's', user: 'u' }).catch((e) => e.code);
  assert.equal(await code(reply('{}'), ''), 'config_error');
  assert.equal(await code(status(429)), 'rate_limited');
  assert.equal(await code(status(401)), 'config_error');
  assert.equal(await code(status(500)), 'provider_error');
  assert.equal(await code(reply('not json')), 'invalid_json');
  assert.equal(await code(reply('{"a":', { finish_reason: 'length' })), 'invalid_json');
  assert.equal(await code(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { refusal: 'no' } }] }) })), 'refused');
});
