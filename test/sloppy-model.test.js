// Contract test: the same synthetic study, answered by a "sloppy" model that writes labels instead of keys,
// framework names with extra words, IDs like "C1" or "C07: text", rq IDs like "RQ 1" and plain-string queries.
// These are the shapes live models produced. Code must read them and reach the same verdicts as the clean run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFixtureStudy, plantedErrorResults } from '../eval/run-fixture.js';
import { RESPONSES } from '../eval/fixtures/tata-vs-mahindra.js';
import { loadConfig } from '../src/config.js';
import { resolveQuestionType, resolveFramework, normaliseId } from '../src/stages/resolve.js';

const { frameworks } = loadConfig({});
const loose = (id) => String(id).replace(/^([A-Z]+)0*(\d+)$/, (m, p, n) => (p === 'RQ' ? `RQ ${n}` : `${p}${n}`));
const looseList = (list) => (list || []).map(loose);
const LABEL = (key) => frameworks.questions[key]?.label ?? key;
const wordy = (name) => ({ 'Market share trend analysis': 'market share trend', 'Competitor matrix': 'Competitor Matrix', 'Unit economics': 'unit-economics analysis' })[name] ?? name;

const SLOPPY = {
  ...RESPONSES,
  scope: {
    ...RESPONSES.scope,
    research_questions: RESPONSES.scope.research_questions.map((q) => ({ ...q, id: loose(q.id), question_type: LABEL(q.question_type), frameworks: q.frameworks.map(wordy) })),
  },
  collect: { queries: RESPONSES.collect.queries.map((q) => ({ ...q, rq_id: loose(q.rq_id) })) },
  validate: {
    claims: RESPONSES.validate.claims.map((c) => ({
      ...c,
      id: loose(c.id),
      rq_id: loose(c.rq_id),
      source_ids: looseList(c.source_ids),
      depends_on: looseList(c.depends_on),
      ...(c.calculation ? { calculation: { ...c.calculation, inputs: Object.fromEntries(Object.entries(c.calculation.inputs).map(([k, v]) => [k, loose(v)])) } } : {}),
    })),
  },
  analyse: {
    ...RESPONSES.analyse,
    frameworks_used: RESPONSES.analyse.frameworks_used.map((f) => ({ ...f, name: wordy(f.name), rq_id: loose(f.rq_id), claim_ids: looseList(f.claim_ids) })),
    findings: RESPONSES.analyse.findings.map((f) => ({ ...f, claim_ids: looseList(f.claim_ids) })),
  },
  challenge: (req, n) => {
    const out = RESPONSES.challenge(req, n);
    return { ...out, verdicts: out.verdicts.map((v) => ({ ...v, target: `${loose(v.target)}: ${v.reason}` })) };
  },
};

test('vocabulary mapping', () => {
  assert.equal(resolveQuestionType('Is the market attractive?', frameworks), 'market_attractive');
  assert.equal(resolveQuestionType('Market_Attractive', frameworks), 'market_attractive');
  assert.equal(resolveQuestionType('brand strength', frameworks), null);
  assert.equal(resolveFramework("Porter's Five Forces", ['Five Forces', 'PESTLE']), 'Five Forces');
  assert.equal(resolveFramework('PESTEL analysis', ['Five Forces', 'PESTLE']), 'PESTLE');
  assert.equal(resolveFramework('Porter Diamond', ['Five Forces', 'PESTLE']), null, 'unknown frameworks stay out');
  assert.deepEqual(['C1', 'c01', 'C01: share', '[C01]', 'RQ 1', 'S1', 'Tata'].map(normaliseId), ['C01', 'C01', 'C01', 'C01', 'RQ1', 'S01', 'Tata']);
});

test('a sloppy model reaches the same verdicts as the clean run', async () => {
  const clean = (await runFixtureStudy()).study;
  const sloppy = (await runFixtureStudy({ responses: SLOPPY })).study;
  assert.equal(sloppy.state, clean.state);
  assert.deepEqual(sloppy.scope.research_questions.map((q) => [q.id, q.question_type, q.frameworks]), clean.scope.research_questions.map((q) => [q.id, q.question_type, q.frameworks]));
  assert.deepEqual(sloppy.claims.map((c) => [c.claim_id, c.status, c.source_ids, c.removed ?? false]), clean.claims.map((c) => [c.claim_id, c.status, c.source_ids, c.removed ?? false]));
  assert.deepEqual(sloppy.frameworks_used.map((f) => f.name), clean.frameworks_used.map((f) => f.name));
  assert.deepEqual(sloppy.quality_gate.checks ?? sloppy.quality_gate, clean.quality_gate.checks ?? clean.quality_gate);
  assert.ok(plantedErrorResults(sloppy).every((r) => r.pass), 'planted errors still caught');
});

test('plain-string search queries are still run', async () => {
  const { study } = await runFixtureStudy({ responses: { ...RESPONSES, collect: { queries: RESPONSES.collect.queries.map((q) => q.text) } } });
  assert.deepEqual(study.search_log.slice(0, 3).map((q) => q.query_text), RESPONSES.collect.queries.map((q) => q.text));
});

test('scope asks once more, naming the problem, when a question type cannot be read', async () => {
  let calls = 0;
  const responses = {
    ...RESPONSES,
    scope: (req) => {
      calls += 1;
      if (calls === 1) return { ...RESPONSES.scope, research_questions: RESPONSES.scope.research_questions.map((q) => ({ ...q, question_type: 'brand_health', frameworks: ['Made-up framework'] })) };
      assert.match(req.user, /brand_health/);
      assert.match(req.user, /market_attractive/);
      return RESPONSES.scope;
    },
  };
  const { study } = await runFixtureStudy({ responses });
  assert.equal(calls, 2);
  assert.notEqual(study.state, 'stage_failed');
});
