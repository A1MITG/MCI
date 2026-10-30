import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFixtureStudy } from '../eval/run-fixture.js';
import { RESPONSES, PAGES, URLS, INPUTS, SEARCH } from '../eval/fixtures/tata-vs-mahindra.js';
import { createHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { fixtureLLM } from '../src/providers/llm/fixture.js';
import { fixtureSearch } from '../src/providers/search/fixture.js';
import { fixtureFetcher } from '../src/providers/fetch/fetcher.js';
import { nextNode } from '../src/core/graph.js';
import { assertTransition, TransitionError } from '../src/core/state.js';
import { runError } from '../src/core/errors.js';

async function harnessWith({ responses = RESPONSES, pages = PAGES, budgets } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'vp-run-'));
  const config = loadConfig({ DATA_DIR: dir });
  config.harness = { ...config.harness, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 }, ...(budgets ? { budgets: { ...config.harness.budgets, ...budgets } } : {}) };
  return createHarness({ config, llm: fixtureLLM({ responses }), search: fixtureSearch({ results: SEARCH }), fetcher: fixtureFetcher(pages) });
}

test('graph: loops fall through to pass when exhausted', () => {
  assert.deepEqual(nextNode('validate', 'needs_sources', {}, 2), { to: 'collect', loopKey: 'validate->collect' });
  assert.equal(nextNode('validate', 'needs_sources', { 'validate->collect': 2 }, 2).to, 'analyse');
  assert.throws(() => nextNode('scope', 'nonsense', {}, 2));
});

test('state machine rejects illegal transitions', () => {
  assert.throws(() => assertTransition('created', 'published'), TransitionError);
  assertTransition('needs_input', 'running');
});

test('runner pauses after scope and refuses to run until answered', async () => {
  const h = await harnessWith();
  const s = await h.createStudy(INPUTS);
  const paused = await h.runner.run(s.study_id);
  assert.equal(paused.state, 'needs_input');
  assert.equal(paused.cursor, 'collect');
  await assert.rejects(h.runner.run(s.study_id), /waiting for input/);
  await assert.rejects(h.runner.answer(s.study_id, { choice: 'Something else' }), /Choose one of/);
});

test('retryable stage errors are retried; exhausted retries leave a resumable stage_failed', async () => {
  let calls = 0;
  const flaky = { ...RESPONSES, analyse: () => { calls += 1; if (calls < 2) throw runError('invalid_json', 'bad json'); return RESPONSES.analyse; } };
  const h = await harnessWith({ responses: flaky });
  const s = await h.createStudy(INPUTS);
  await h.runner.run(s.study_id);
  await h.runner.answer(s.study_id, { choice: 'Domestic PV only' });
  const done = await h.runner.run(s.study_id);
  assert.equal(done.state, 'published_with_gaps');
  const events = (await h.store.events(s.study_id)).filter((e) => e.type === 'stage_retry');
  assert.equal(events.length, 1);

  const broken = await harnessWith({ responses: { ...RESPONSES, analyse: () => { throw runError('invalid_json', 'always bad'); } } });
  const b = await broken.createStudy(INPUTS);
  await broken.runner.run(b.study_id);
  await broken.runner.answer(b.study_id, { choice: 'Domestic PV only' });
  const failed = await broken.runner.run(b.study_id);
  assert.equal(failed.state, 'stage_failed');
  assert.equal(failed.error.stage, 'analyse');
  assert.equal(failed.cursor, 'analyse', 'resume restarts at the failed stage');
});

test('budget limit pauses for approval, and an approved raise resumes the run', async () => {
  const h = await harnessWith({ budgets: { maxSearchesPerStudy: 2 } });
  const s = await h.createStudy(INPUTS);
  await h.runner.run(s.study_id);
  await h.runner.answer(s.study_id, { choice: 'Domestic PV only' });
  const paused = await h.runner.run(s.study_id);
  assert.equal(paused.state, 'needs_input');
  assert.equal(paused.pending_input.type, 'budget_raise');
  await h.runner.answer(s.study_id, { approve: true, new_limit: 40 });
  const done = await h.runner.run(s.study_id);
  assert.equal(done.state, 'published_with_gaps');
});

test('locked studies cannot run; cancel stops a running study', async () => {
  const h = await harnessWith();
  const s = await h.createStudy(INPUTS);
  await h.store.lock(s.study_id);
  await assert.rejects(h.runner.run(s.study_id), /locked/);
  await h.store.unlock(s.study_id);

  let release;
  let entered;
  const gate = new Promise((r) => { release = r; });
  const inScope = new Promise((r) => { entered = r; });
  const slow = await harnessWith({ responses: { ...RESPONSES, scope: async () => { entered(); await gate; return RESPONSES.scope; } } });
  const t = await slow.createStudy(INPUTS);
  const running = slow.runner.run(t.study_id);
  await inScope; // cancel while the study is inside a stage, not after a fixed wait
  assert.ok(slow.runner.cancel(t.study_id));
  release();
  assert.equal((await running).state, 'cancelled');
});

test('library: an unchanged prior study is re-checked and reused; a material change triggers a full redo', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vp-lib-'));
  const first = await runFixtureStudy({ dataDir: dir });
  await first.harness.store.save(first.study.study_id);

  const again = await runFixtureStudy({ dataDir: dir });
  assert.equal(again.study.state, 'confirmed');
  assert.equal(again.study.library.decision, 'reused_prior');
  assert.equal(again.study.library.prior_study_id, first.study.study_id);
  assert.ok(again.study.claims.length > 0);
  assert.equal(again.harness.llm.calls.length, 0, 'no model calls when nothing changed');
  assert.ok(await again.harness.store.readOutput(again.study.study_id, 'report.html'));

  const changedPages = { ...PAGES, [URLS.tataAR]: 'SYNTHETIC TEST PAGE. Restated figures to follow.' };
  const redo = await runFixtureStudy({ dataDir: dir, pages: changedPages });
  assert.equal(redo.study.library.decision, 'full_redo');
  assert.ok(redo.study.library.recheck.changed_claim_ids.includes('C01'));
  assert.ok(['published_with_gaps', 'gate_blocked'].includes(redo.study.state), redo.study.state);
});
