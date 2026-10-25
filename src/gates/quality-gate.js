// Master prompt v2 section 12: the final quality gate, computed by code.
// Mechanical checks (1, 2, 4, 5, 9, 11, 14) are evaluated here from the registers.
// Judged checks (3, 6, 7, 8, 10, 13) come from the independent auditor; check 12 combines both.
// A Fail on a critical check (config gate.critical) blocks publication. Partials are disclosed.

export const CHECKS = {
  1: 'Every material factual claim has a traceable source',
  2: 'Each cited source was accessed and supports the claim as worded',
  3: 'Dates, units, currencies, denominators and periods are consistent',
  4: 'Calculations are reproducible from disclosed inputs',
  5: 'Facts are separated from estimates, inferences and hypotheses',
  6: 'Contradictory evidence and alternative explanations were considered',
  7: 'Competitors and substitutes were chosen by explicit criteria',
  8: 'Financial and market comparisons are comparable, or the gap is disclosed',
  9: 'Missing data and inaccessible sources are disclosed',
  10: 'India-specific conclusions rest on India-specific evidence',
  11: 'Recommendations trace to findings and are scored separately',
  12: 'No unsupported forecasts, probabilities or numbers',
  13: 'Known and unknown are clearly separated',
  14: 'Every cited page is archived, or the reason it is not is disclosed',
};

const RANK = { Pass: 0, Partial: 1, Fail: 2 };
const worst = (...rs) => rs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'Pass');
const r = (result, note) => ({ result, note });

export function runQualityGate(study, config) {
  const threshold = config.harness.materialThreshold;
  const critical = new Set(config.harness.gate.critical.map(Number));
  const live = (study.claims || []).filter((c) => !c.removed);
  const material = live.filter((c) => c.materiality >= threshold && c.status !== 'Not established');
  const srcById = new Map((study.sources || []).map((s) => [s.source_id, s]));
  const cited = new Set(live.flatMap((c) => c.source_ids));
  const judged = study.challenge?.judged_checks || {};
  const results = {};

  // 1. Facts cite sources; inferences, estimates and calculations cite the claims they rest on.
  const untraced = material.filter((c) => (c.kind === 'claim' && c.status !== 'Calculated' ? !c.source_ids.length : !c.source_ids.length && !c.depends_on.length));
  results[1] = untraced.length ? r('Fail', `No source or input claim: ${ids(untraced)}`) : r('Pass', `${material.length} material claims traced`);

  // 2. Every Verified or Reported claim has its passage in the saved copy; downgrades are disclosed.
  const unsupported = material.filter((c) => ['Verified', 'Reported'].includes(c.status) && !c.passage_found_in_snapshot);
  const missingCopy = [...cited].filter((sid) => !srcById.get(sid)?.sha256);
  const downgraded = live.filter((c) => c.status_note && c.proposed_status !== c.status);
  if (unsupported.length || missingCopy.length) results[2] = r('Fail', [unsupported.length && `passage not found: ${ids(unsupported)}`, missingCopy.length && `no saved copy: ${missingCopy.join(', ')}`].filter(Boolean).join('; '));
  else if (downgraded.length) results[2] = r('Partial', `Downgraded by code because the source did not support the wording: ${ids(downgraded)}`);
  else results[2] = r('Pass', `${cited.size} cited sources read and quote-checked`);

  // 4. Every calculation was recomputed by code.
  const calcs = live.filter((c) => c.status === 'Calculated');
  const notReproduced = calcs.filter((c) => c.calculation?.computed_by !== 'code' || c.calculation?.result == null);
  results[4] = notReproduced.length ? r('Fail', `Not reproduced: ${ids(notReproduced)}`) : r('Pass', calcs.length ? `${calcs.length} calculations recomputed by code` : 'No calculations');

  // 5. Status vocabulary is the fixed seven, and non-facts never carry a fact status.
  const statuses = new Set(config.rubric.statuses);
  const badStatus = live.filter((c) => !statuses.has(c.status) || (c.kind !== 'claim' && ['Verified', 'Reported'].includes(c.status)));
  results[5] = badStatus.length ? r('Fail', `Wrong status for its kind: ${ids(badStatus)}`) : r('Pass', 'All claims carry one of the seven statuses');

  // 9. Gaps and inaccessible sources appear in the disclosures that code adds to page one.
  const gaps = (study.scope?.research_questions || []).filter((q) => q.evidence === 'Not established');
  const inaccessible = study.inaccessible_sources || [];
  const disclosed = study.report?.disclosures || [];
  const undisclosed = [...gaps.map((q) => q.id), ...inaccessible.map((s) => s.url)].filter((k) => !disclosed.some((d) => d.includes(k)));
  results[9] = undisclosed.length ? r('Fail', `Not disclosed: ${undisclosed.join(', ')}`) : r('Pass', `${gaps.length} evidence gaps and ${inaccessible.length} inaccessible sources disclosed`);

  // 11. Recommendations rest on claims and have their own score.
  const recs = study.recommendations || [];
  const badRecs = recs.filter((x) => !x.starting_fact_ids.length || !x.confidence);
  results[11] = badRecs.length ? r('Fail', `Untraced or unscored: ${badRecs.map((x) => x.rec_id).join(', ')}`) : r('Pass', recs.length ? `${recs.length} recommendations traced and scored` : 'No recommendations made');

  // 12. Code removed any sentence with a number but no claim ID; the auditor judges forecasts.
  const stripped = study.report?.uncited_numbers_removed || [];
  const mech = stripped.length ? r('Partial', `${stripped.length} sentences with uncited numbers removed`) : r('Pass', 'Every number in the text carries a claim ID');
  const j12 = judged['12'] || r('Partial', 'Not assessed by the auditor');
  results[12] = r(worst(mech.result, j12.result), [mech.note, j12.note].filter(Boolean).join('; '));

  // 14. Saved copies are local and hashed; public archiving arrives in a later phase.
  const citedSources = [...cited].map((sid) => srcById.get(sid)).filter(Boolean);
  const noRecord = citedSources.filter((s) => !s.archived_url && !s.not_archived_reason);
  const localOnly = citedSources.filter((s) => !s.archived_url);
  results[14] = noRecord.length ? r('Fail', `No archive or reason: ${noRecord.map((s) => s.source_id).join(', ')}`)
    : localOnly.length ? r('Partial', `${localOnly.length} sources kept as local hashed copies; not publicly archived`) : r('Pass', 'All cited pages archived');

  for (const k of ['3', '6', '7', '8', '10', '13']) results[k] = judged[k] || r('Partial', 'Not assessed by the auditor');

  const rows = Object.keys(CHECKS).map((n) => ({ n: Number(n), check: CHECKS[n], critical: critical.has(Number(n)), ...results[n] }));
  const blocking = rows.filter((x) => x.critical && x.result === 'Fail');
  const gapsShown = rows.filter((x) => x.result !== 'Pass');
  const outcome = blocking.length ? 'gate_blocked' : gapsShown.length ? 'pass_with_gaps' : 'pass';
  return {
    rows,
    outcome,
    summary: blocking.length
      ? `Blocked: critical checks failed (${blocking.map((x) => x.n).join(', ')}). Correct, downgrade or remove the claims and re-run.`
      : `Passes all critical checks${gapsShown.length ? `, with ${gapsShown.length} partial or non-critical results disclosed` : ''}.`,
  };
}

const ids = (claims) => claims.map((c) => c.claim_id).join(', ');
