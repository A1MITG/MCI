// End to end on the synthetic Tata vs Mahindra fixture: no network, no keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFixtureStudy, plantedErrorResults, reportProse } from '../eval/run-fixture.js';
import { RESPONSES, PAGES, URLS } from '../eval/fixtures/tata-vs-mahindra.js';
import { runQualityGate } from '../src/gates/quality-gate.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({});

test('full study runs through every stage and publishes with disclosed gaps', async () => {
  const { study, harness } = await runFixtureStudy();
  assert.equal(study.state, 'published_with_gaps');
  for (const s of ['scope', 'collect', 'validate', 'analyse', 'challenge', 'publish']) assert.notEqual(study.stages[s].status, 'failed', s);
  assert.equal(study.scope.confirmed_by_user.choice, 'Domestic PV only');
  assert.deepEqual(study.loop_limits_hit, ['validate->collect']);
  assert.equal(study.loop_counts['challenge->collect'], 1, 'auditor counter-evidence loop ran once');
  assert.ok(study.version >= 2, 'a version was snapshotted at the end of the run');

  const html = await harness.store.readOutput(study.study_id, 'report.html');
  assert.match(html, /Published with gaps/);
  assert.match(html, /data-claim="C01"/);
  assert.doesNotMatch(html, /<script>alert/);
  const events = (await harness.store.events(study.study_id)).map((e) => e.type);
  assert.ok(events.includes('needs_input') && events.includes('run_finished'));
});

test('planted errors (master prompt v2 section 13) all pass', async () => {
  const { study } = await runFixtureStudy();
  for (const r of plantedErrorResults(study)) assert.ok(r.pass, r.test);
});

test('code, not the model, decides tiers, quotes, calculations and scores', async () => {
  const { study } = await runFixtureStudy();
  const byId = Object.fromEntries(study.claims.map((c) => [c.claim_id, c]));
  assert.equal(byId.C04.calculation.result, 12.5);
  assert.equal(byId.C04.calculation.computed_by, 'code');
  assert.deepEqual(study.sources.map((s) => s.tier), [1, 3, 1, 5]);
  assert.equal(byId.C07.status, 'Reported', 'Verified claim whose quote is missing is downgraded');
  assert.equal(byId.C01.confidence.total, 91);
  assert.equal(byId.C05.confidence.total, 79 - 15, 'contradiction penalty applied automatically');
});

test('sentences with numbers but no claim ID are removed from the report', async () => {
  const { study } = await runFixtureStudy();
  assert.ok(!reportProse(study.report).includes('about 15% last year'));
  assert.ok(study.report.uncited_numbers_removed.some((s) => s.sentence.includes('about 15%')));
});

test('fetched pages are wrapped as untrusted data before the model sees them', async () => {
  const { harness } = await runFixtureStudy();
  const validateCall = harness.llm.calls.find((c) => c.stage === 'validate');
  assert.match(validateCall.user, /<source id="S04" tier="5" url="[^"]+" trust="untrusted">/);
  assert.match(validateCall.system, /untrusted/i);
});

test('the auditor gets a fresh context: no researcher prompts or reasoning', async () => {
  const { harness } = await runFixtureStudy();
  const audit = harness.llm.calls.find((c) => c.stage === 'challenge');
  assert.equal(audit.role, 'auditor');
  assert.doesNotMatch(audit.system, /Stage 03 Validate|Stage 04 Analyse/);
  assert.doesNotMatch(audit.user, /SYNTHETIC TEST PAGE/, 'auditor sees registers, not raw pages');
});

test('if the auditor misses the false claim, the gate blocks publication', async () => {
  const lenient = { ...RESPONSES, challenge: (req, n) => ({ ...RESPONSES.challenge(req, n), verdicts: [] }) };
  const { study } = await runFixtureStudy({ responses: lenient });
  assert.equal(study.state, 'gate_blocked');
  const row2 = study.quality_gate.rows.find((r) => r.n === 2);
  assert.equal(row2.result, 'Fail');
  assert.match(row2.note, /C07/);
});

test('quality gate: critical fail blocks, partials pass with gaps', () => {
  const base = {
    claims: [{ claim_id: 'C01', kind: 'claim', status: 'Verified', materiality: 4, source_ids: ['S01'], depends_on: [], passage_found_in_snapshot: true }],
    sources: [{ source_id: 'S01', sha256: 'a'.repeat(64), archived_url: 'https://archive.example/x' }],
    scope: { research_questions: [] },
    recommendations: [],
    report: { disclosures: [], uncited_numbers_removed: [] },
    challenge: { judged_checks: Object.fromEntries(['3', '6', '7', '8', '10', '12', '13'].map((k) => [k, { result: 'Pass', note: '' }])) },
  };
  assert.equal(runQualityGate(base, config).outcome, 'pass');
  const untraced = structuredClone(base);
  untraced.claims[0].source_ids = [];
  assert.equal(runQualityGate(untraced, config).outcome, 'gate_blocked');
  const judgedPartial = structuredClone(base);
  judgedPartial.challenge.judged_checks['8'] = { result: 'Partial', note: 'gap' };
  assert.equal(runQualityGate(judgedPartial, config).outcome, 'pass_with_gaps');
});

test('inaccessible pages are disclosed once, not once per loop', async () => {
  const { study } = await runFixtureStudy();
  assert.equal(study.inaccessible_sources.length, 1);
  assert.equal(study.inaccessible_sources[0].url, URLS.paywall);
  assert.ok(!(URLS.paywall in PAGES));
});
