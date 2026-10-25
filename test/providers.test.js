import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config.js';
import { createSearch, SEARCH_PROVIDERS } from '../src/providers/search/index.js';
import { createLLM } from '../src/providers/llm/index.js';
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
