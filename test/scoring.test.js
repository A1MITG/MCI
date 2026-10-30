import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { scoreConfidence, applyInferenceCeiling, labelFor, ScoringError } from '../src/scoring/confidence.js';
import { scoreRecommendation } from '../src/scoring/recommendation.js';
import { enforceStatus, passageFound, tierForUrl } from '../src/scoring/status.js';
import { evaluate, CalcError } from '../src/scoring/calc.js';

const config = loadConfig({});
const { rubric, sourceTiers } = config;
const c = (authority, directness, corroboration, recency, consistency) => ({ authority, directness, corroboration, recency, consistency });

test('master prompt v2 worked examples reproduce', () => {
  assert.equal(scoreConfidence(c(20, 18, 8, 14, 18), ['single_origin', 'intermediary'], rubric).total, 63);
  assert.equal(scoreConfidence(c(15, 18, 18, 15, 12), [], rubric).total, 78);
  assert.equal(scoreConfidence(c(10, 6, 4, 12, 10), [], rubric).total, 42);
});

test('labels follow the v2 bands', () => {
  assert.equal(labelFor(85, rubric), 'Strongly supported');
  assert.equal(labelFor(84, rubric), 'Well supported');
  assert.equal(labelFor(70, rubric), 'Well supported');
  assert.equal(labelFor(69, rubric), 'Partially supported');
  assert.equal(labelFor(50, rubric), 'Partially supported');
  assert.equal(labelFor(49, rubric), 'Weakly supported');
  assert.equal(labelFor(null, rubric), null);
});

test('totals clamp to 0-100 and penalties stack once each', () => {
  const s = scoreConfidence(c(2, 2, 0, 2, 2), ['unresolved_contradiction', 'single_origin', 'unresolved_contradiction'], rubric);
  assert.equal(s.total, 0);
  assert.equal(s.penalties.length, 2);
});

test('out-of-range components and unknown penalties are rejected', () => {
  assert.throws(() => scoreConfidence(c(26, 20, 20, 15, 20), [], rubric), ScoringError);
  assert.throws(() => scoreConfidence({ authority: 10 }, [], rubric), ScoringError);
  assert.throws(() => scoreConfidence(c(10, 10, 10, 10, 10), ['vibes'], rubric), ScoringError);
});

test('authority outside the tier band warns but does not change the total', () => {
  const s = scoreConfidence(c(12, 20, 12, 15, 19), [], rubric, { tier: 1 });
  assert.equal(s.total, 78);
  assert.match(s.warnings[0], /tier 1 band 23-25/);
});

test('inference ceiling: never above the weakest material input + 10', () => {
  const input = { materiality: 4, confidence: { total: 55 } };
  const minor = { materiality: 2, confidence: { total: 20 } };
  const inf = { status: 'Inferred', confidence: scoreConfidence(c(25, 13, 12, 15, 19), [], rubric) };
  const capped = applyInferenceCeiling(inf, [input, minor], rubric, 3);
  assert.equal(capped.confidence.total, 65);
  assert.equal(capped.confidence.label, 'Partially supported');
  const fact = { status: 'Verified', confidence: inf.confidence };
  assert.equal(applyInferenceCeiling(fact, [input], rubric, 3).confidence.total, 84);
});

test('recommendation scoring is separate and caps assumption penalties at two', () => {
  const r = scoreRecommendation({ demand: 20, economics: 20, competitor_response: 15, feasibility: 12, reversibility: 13 }, ['a', 'b', 'c'], rubric);
  assert.equal(r.total, 60);
  assert.equal(r.penalty, -20);
});

test('status rules: Verified needs tier 1-2 and a quote match', () => {
  assert.equal(enforceStatus('Verified', { bestTier: 1, passageMatched: true }).status, 'Verified');
  assert.equal(enforceStatus('Verified', { bestTier: 3, passageMatched: true }).status, 'Reported');
  assert.equal(enforceStatus('Verified', { bestTier: 1, passageMatched: false }).status, 'Reported');
  assert.equal(enforceStatus('Verified', { bestTier: 5, passageMatched: true }).status, 'Hypothesis');
  assert.equal(enforceStatus('Verified', { bestTier: 1, passageMatched: false, structuredFiling: true }).status, 'Verified');
  assert.equal(enforceStatus('Reported', { bestTier: 4, passageMatched: false }).status, 'Hypothesis');
});

test('quote check tolerates whitespace, case, curly quotes and Indian digit grouping', () => {
  const page = 'Tata Motors’ PV  wholesales were 5,53,585 units\nin FY24.';
  assert.ok(passageFound("tata motors' pv wholesales were 553585 units in FY24", page));
  assert.ok(!passageFound('EBITDA margin was 15%', page));
  assert.ok(!passageFound('FY24', page), 'passages under 8 characters never match');
});

test('source tiers come from the domain table, never from the model', () => {
  assert.equal(tierForUrl('https://www.bseindia.com/x', sourceTiers), 1);
  assert.equal(tierForUrl('https://www.siam.in/x', sourceTiers), 3);
  assert.equal(tierForUrl('https://www.reddit.com/r/x', sourceTiers), 5);
  assert.equal(tierForUrl('https://unknown.example/x', sourceTiers), 4);
  assert.equal(tierForUrl('https://www.tatamotors.com/ir', sourceTiers, ['tatamotors.com']), 2);
});

test('safe calculator evaluates formulas and refuses anything else', () => {
  assert.equal(evaluate('a / b * 100', { a: 500000, b: 4000000 }), 12.5);
  assert.equal(evaluate('(a - b) / b', { a: 110, b: 100 }), 0.1);
  assert.throws(() => evaluate('a / b', { a: 1, b: 0 }), CalcError);
  assert.throws(() => evaluate('process.exit()', {}), CalcError);
  assert.throws(() => evaluate('a + c', { a: 1 }), CalcError);
});

// ---- the two hand-built claim registers as regression fixtures ----------------

const registers = JSON.parse(readFileSync(new URL('./fixtures/registers.json', import.meta.url)));
const PENALTY_KEYS = { intermediary: 'intermediary', 'single origin': 'single_origin', 'unresolved contradiction': 'unresolved_contradiction' };

for (const name of ['golden', 'samsung']) {
  test(`${name} register: every scored row reproduces its total and label`, () => {
    let checked = 0;
    let viaRubricPenalties = 0;
    for (const row of registers[name]) {
      if (row.status === 'Not established' || row.components.authority == null) continue;
      const raw = Object.values(row.components).reduce((s, v) => s + v, 0) + row.penalty_total;
      const total = Math.max(0, Math.min(100, raw));
      if (row.confidence != null) assert.equal(total, row.confidence, `${row.claim_id} total`);
      assert.equal(labelFor(total, rubric), row.label, `${row.claim_id} label`);
      // Rows whose penalties are all rubric penalties must reproduce through scoreConfidence itself.
      const reasons = String(row.penalty_reasons || '').split(/[;,]/).map((p) => p.trim().replace(/^-?\d+\s*/, '').replace(/\s*\(.*\)$/, '')).filter((p) => p && p !== 'None');
      if (reasons.every((r) => PENALTY_KEYS[r])) {
        assert.equal(scoreConfidence(row.components, reasons.map((r) => PENALTY_KEYS[r]), rubric).total, total, `${row.claim_id} via rubric`);
        viaRubricPenalties += 1;
      }
      checked += 1;
    }
    assert.ok(checked > 30, `checked ${checked} rows`);
    assert.ok(viaRubricPenalties > 25, `${viaRubricPenalties} rows reproduced through the rubric`);
  });

  test(`${name} register: Verified rows rest on tier 1-2 sources`, () => {
    for (const row of registers[name].filter((r) => r.status === 'Verified' && r.best_tier != null)) {
      assert.ok(row.best_tier <= 2, `${row.claim_id} is Verified on tier ${row.best_tier}`);
    }
  });
}
