// Fixes from the first live OpenAI + Tavily study (Pepsi, India, 2026-10-30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from '../src/providers/fetch/fetcher.js';
import { passageFound } from '../src/scoring/status.js';
import { applyVerdicts } from '../src/stages/challenge.js';
import { commitClaims } from '../src/stages/validate.js';
import { loadConfig } from '../src/config.js';

test('HTML entities are decoded, including double-encoded ones, so quotes still match', () => {
  const text = htmlToText('<p>PepsiCo India&amp;#x27;s beverage sales &#8212; up 9% &rsquo;24 &unknown;</p>');
  assert.equal(text, "PepsiCo India's beverage sales — up 9% ’24 &unknown;");
  assert.equal(passageFound("PepsiCo India's beverage sales", text), true);
});

test('an estimate proposed as Reported is relabelled Estimated before the gate', async () => {
  const config = loadConfig({});
  const study = { study_id: 'st_x', sources: [{ source_id: 'S01', tier: 4, sha256: 'h' }], claims: [] };
  const store = { getSnapshot: async () => 'India beverages market USD 18.6bn in 2025, CAGR 6.8% to 2031' };
  const claims = await commitClaims(study, [
    { id: 'E02', kind: 'estimate', status: 'Reported', source_ids: ['S01'], supporting_passage: 'India beverages market USD 18.6bn in 2025', wording: 'w', components: { authority: 10, directness: 10, corroboration: 5, recency: 10, consistency: 10 }, materiality: 4 },
    { id: 'C01', kind: 'claim', status: 'Reported', source_ids: ['S01'], supporting_passage: 'CAGR 6.8% to 2031', wording: 'w', components: { authority: 10, directness: 10, corroboration: 5, recency: 10, consistency: 10 }, materiality: 3 },
  ], { config, store });
  const byId = Object.fromEntries(claims.map((c) => [c.claim_id, c]));
  assert.equal(byId.E02.status, 'Estimated');
  assert.match(byId.E02.status_note, /estimate cannot carry/);
  assert.equal(byId.C01.status, 'Reported', 'real claims keep a matched Reported status');
});

test('challenge verdicts are read when the model names the target loosely', () => {
  const config = loadConfig({});
  const mk = () => ({ claims: [{ claim_id: 'C01', status: 'Reported', materiality: 4 }, { claim_id: 'E02', status: 'Estimated', materiality: 4 }], findings: [] });
  const a = mk();
  applyVerdicts(a, { verdicts: [{ target: 'C01: PepsiCo share claim', verdict: 'Downgrade', to_status: 'Hypothesis' }, { claim_id: 'E02', verdict: 'keep' }] }, config);
  assert.deepEqual(a.challenge.verdicts.map((v) => v.target), ['C01', 'E02']);
  assert.equal(a.claims[0].status, 'Hypothesis');
  const b = mk();
  applyVerdicts(b, { audit: [{ id: 'E02', verdict: 'remove', reason: 'r' }] }, config);
  assert.equal(b.claims[1].removed, true);
  const c = mk();
  applyVerdicts(c, { verdicts: [{ target: 'Z99', verdict: 'remove' }] }, config);
  assert.equal(c.claims.some((x) => x.removed), false, 'unknown IDs are still ignored');
});
