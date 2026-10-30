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
import { LATEST_PERIOD } from '../src/stages/understand.js';
import { RESPONSES, PAGES, SEARCH, INPUTS } from '../eval/fixtures/tata-vs-mahindra.js';

const QUESTION = { question: INPUTS.question };

async function harnessWith(understand) {
  const dir = await mkdtemp(path.join(tmpdir(), 'vp-understand-'));
  const config = loadConfig({ DATA_DIR: dir });
  config.harness = { ...config.harness, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 } };
  const llm = fixtureLLM({ responses: { ...RESPONSES, understand } });
  return { llm, harness: createHarness({ config, llm, search: fixtureSearch({ results: SEARCH }), fetcher: fixtureFetcher(PAGES) }) };
}

const until = async (fn) => {
  for (let i = 0; i < 200; i += 1) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
};

test('a question alone starts a study; blanks are read from the question and shown before research', async (t) => {
  const { harness } = await harnessWith({ subject: 'Tata Motors', me: 'Mahindra', perspective: 'competitor', geography: 'India', period: '', title: 'Tata vs Mahindra' });
  const server = createServer(harness).listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => (await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();

  const created = await call('POST', '/studies', QUESTION);
  assert.equal(created.ok, true);
  const id = created.study.study_id;
  const paused = await until(async () => { const r = await call('GET', `/studies/${id}`); return r.study.state === 'needs_input' && !r.study.running && r.study; });
  assert.equal(paused.pending_input.type, 'scope_confirmation', 'the plan is still confirmed before any research');
  assert.equal(paused.inputs.subject.name, 'Tata Motors');
  assert.equal(paused.inputs.me.name, 'Mahindra');
  assert.equal(paused.inputs.perspective, 'competitor');
  assert.equal(paused.inputs.period, LATEST_PERIOD, 'no period in the question is shown as the latest year, never left blank');
  assert.equal(paused.inputs.depth, 'Standard');
  assert.deepEqual(paused.inputs.inferred, ['subject', 'me', 'perspective', 'geography', 'period']);
  assert.equal(paused.search_log?.length || 0, 0, 'nothing is searched before the plan is confirmed');
});

test('what the user typed wins over the model, and a bad perspective is not let through', async () => {
  const { harness } = await harnessWith({ subject: 'Someone Else', perspective: 'galaxy_brain', geography: 'Mars', period: 'FY99' });
  const s = await harness.createStudy({ question: 'q', subject: 'Tata Motors', geography: 'India' });
  const paused = await harness.runner.run(s.study_id);
  assert.equal(paused.inputs.subject.name, 'Tata Motors');
  assert.equal(paused.inputs.geography, 'India');
  assert.equal(paused.inputs.perspective, 'market', 'unknown perspective falls back in code');
  assert.deepEqual(paused.inputs.inferred, ['perspective', 'period']);
});

test('if no company can be read from the question, the study stops visibly before scope', async () => {
  const { harness, llm } = await harnessWith({ subject: '', perspective: 'market', geography: '', period: '' });
  const s = await harness.createStudy({ question: 'What is going on?' });
  const failed = await harness.runner.run(s.study_id);
  assert.equal(failed.state, 'stage_failed');
  assert.equal(failed.error.stage, 'understand');
  assert.match(failed.error.message, /Could not tell which company/);
  assert.equal(llm.calls.filter((c) => c.stage === 'scope').length, 0, 'no money spent on scope');
});

test('a fully filled-in study skips the extra model call', async () => {
  const { harness, llm } = await harnessWith(() => { throw new Error('should not be called'); });
  const s = await harness.createStudy(INPUTS);
  const paused = await harness.runner.run(s.study_id);
  assert.equal(paused.state, 'needs_input');
  assert.equal(llm.calls.filter((c) => c.stage === 'understand').length, 0);
});
