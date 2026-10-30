import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server/app.js';
import { fixtureLLM } from '../src/providers/llm/fixture.js';
import { fixtureSearch } from '../src/providers/search/fixture.js';
import { fixtureFetcher } from '../src/providers/fetch/fetcher.js';
import { RESPONSES, PAGES, SEARCH, INPUTS } from '../eval/fixtures/tata-vs-mahindra.js';

async function boot() {
  const dir = await mkdtemp(path.join(tmpdir(), 'vp-http-'));
  const config = loadConfig({ DATA_DIR: dir });
  const harness = createHarness({ config, llm: fixtureLLM({ responses: RESPONSES }), search: fixtureSearch({ results: SEARCH }), fetcher: fixtureFetcher(PAGES) });
  const server = createServer(harness).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  return { server, call, harness };
}

const until = async (fn) => {
  for (let i = 0; i < 200; i += 1) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
};

test('HTTP lifecycle: create, answer scope, publish, save, lock, unlock, rollback, delete', async (t) => {
  const { server, call, harness } = await boot();
  t.after(() => server.close());

  assert.equal((await call('POST', '/studies', {})).status, 400);
  const created = await call('POST', '/studies', INPUTS);
  assert.equal(created.status, 201);
  const id = created.body.study.study_id;

  const paused = await until(async () => { const r = await call('GET', `/studies/${id}`); return r.body.study.state === 'needs_input' && !r.body.study.running && r.body.study; });
  assert.equal(paused.pending_input.type, 'scope_confirmation');
  await call('POST', `/studies/${id}/answer`, { choice: paused.pending_input.options[0] });
  const done = await until(async () => { const r = await call('GET', `/studies/${id}`); return r.body.study.state === 'published_with_gaps' && !r.body.study.running && r.body.study; });

  const report = await call('GET', `/studies/${id}/report.html`);
  assert.equal(report.status, 200);
  assert.match(report.body, /Vantage Point/);

  assert.equal((await call('POST', `/studies/${id}/save`)).body.study.saved, true);
  assert.equal((await call('POST', `/studies/${id}/lock`)).body.study.locked, true);
  assert.equal((await call('DELETE', `/studies/${id}`)).status, 423);
  assert.equal((await call('POST', `/studies/${id}/run`)).status, 423);
  await call('POST', `/studies/${id}/unlock`);

  const versions = (await call('GET', `/studies/${id}/versions`)).body.versions;
  assert.ok(versions.length >= 2);
  const rolled = await call('POST', `/studies/${id}/rollback`, { version: versions[0] });
  assert.equal(rolled.status, 200);
  assert.ok(rolled.body.study.version > done.version);

  assert.equal((await call('DELETE', `/studies/${id}`)).status, 200);
  assert.equal((await call('GET', `/studies/${id}`)).status, 404);
  assert.equal(harness.runner.isRunning(id), false);
});
