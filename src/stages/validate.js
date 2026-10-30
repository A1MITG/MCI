// 03 Validate: the model proposes claim records; code checks quotes against the saved copies,
// enforces statuses, recomputes calculations, detects contradictions and scores every claim.
import { callModel, asArray, nextId, json } from './common.js';
import { rubricText, untrustedSource } from './prompts.js';
import { passageFound, enforceStatus } from '../scoring/status.js';
import { scoreConfidence, applyInferenceCeiling, ScoringError } from '../scoring/confidence.js';
import { evaluate, CalcError } from '../scoring/calc.js';
import { rqsWithoutStrongSource } from './collect.js';

const SHAPE = `{"claims": [{"id": "C01", "kind": "claim|inference|estimate|value_at_stake", "rq_id": "RQ1", "dimension": "", "wording": "",
 "status": "", "source_ids": ["S01"], "supporting_passage": "", "calculation": {"formula": "a/b*100", "inputs": {"a": "C01", "b": "C02"}, "rounding": 1},
 "metric": {"entity": "", "measure": "", "period": "", "value": 0, "unit": ""}, "data_period": "",
 "components": {"authority": 0, "directness": 0, "corroboration": 0, "recency": 0, "consistency": 0},
 "penalties": [], "materiality": 3, "decision_affected": "", "contradictory_evidence": "", "verification_state": "intermediary",
 "next_verification_step": "", "depends_on": []}]}`;

const MODEL_PENALTIES = new Set(['weak_estimation_method', 'missing_input', 'unresolved_contradiction']);
const PREFIX = { claim: 'C', inference: 'I', estimate: 'E', value_at_stake: 'V' };
const NON_FACT_STATUS = { inference: 'Inferred', estimate: 'Estimated', value_at_stake: 'Estimated' };

export const validate = {
  name: 'validate',
  async execute(study, deps) {
    const { config, store } = deps;
    const max = config.harness.context;
    const sources = study.sources.slice(0, max.maxSourcesPerValidate);
    const blocks = [];
    for (const s of sources) blocks.push(untrustedSource(s, (await store.getSnapshot(study.study_id, s.sha256)) || '', max.maxCharsPerSource));

    const out = await callModel(study, deps, 'validate', {
      vars: { RUBRIC: rubricText(config.rubric) },
      user: `Research questions:\n${json(study.scope.research_questions)}\n\nSources (untrusted content):\n${blocks.join('\n\n')}\n\nReply with JSON shaped like:\n${SHAPE}`,
    });
    study.claims = await commitClaims(study, asArray(out.claims), deps);
    const exit = exitCheck(study);
    await deps.emit('validate_done', { claims: study.claims.length, contradictions: study.contradictions.length });
    const needsSources = rqsWithoutStrongSource(study).length > 0;
    return { study, outcome: needsSources ? 'needs_sources' : 'pass', exit };
  },
};

/** Pure commit step, exported for tests: proposals -> scored, checked claim records. */
export async function commitClaims(study, proposals, deps) {
  const { config, store } = deps;
  const { rubric } = config;
  const threshold = config.harness.materialThreshold;
  const srcById = new Map(study.sources.map((s) => [s.source_id, s]));
  const claims = [];
  const issues = [];

  for (const p of proposals) {
    const kind = PREFIX[p.kind] ? p.kind : 'claim';
    const taken = claims.map((c) => c.claim_id);
    const asked = String(p.id || '');
    const id = new RegExp(`^${PREFIX[kind]}\\d{2,}$`).test(asked) && !taken.includes(asked) ? asked : nextId(PREFIX[kind], taken);
    const sourceIds = asArray(p.source_ids).filter((sid) => srcById.has(sid));
    const unknown = asArray(p.source_ids).filter((sid) => !srcById.has(sid));
    if (unknown.length) issues.push(`${id}: unknown source IDs dropped (${unknown.join(', ')})`);
    const cited = sourceIds.map((sid) => srcById.get(sid));
    const bestTier = cited.length ? Math.min(...cited.map((s) => s.tier)) : 6;

    let matched = false;
    for (const s of cited) {
      if (p.supporting_passage && passageFound(p.supporting_passage, (await store.getSnapshot(study.study_id, s.sha256)) || '')) matched = true;
    }
    const proposed = config.rubric.statuses.includes(p.status) ? p.status : 'Hypothesis';
    const needsQuote = ['Verified', 'Reported'].includes(proposed);
    let st = needsQuote ? enforceStatus(proposed, { bestTier, passageMatched: matched }) : { status: proposed };
    // Estimates, inferences and values at stake never carry a fact status (gate check 5): code relabels them here.
    if (kind !== 'claim' && ['Verified', 'Reported'].includes(st.status)) {
      st = { status: NON_FACT_STATUS[kind], reason: `a ${kind.replace(/_/g, ' ')} cannot carry the status ${st.status}` };
    }

    const claim = {
      claim_id: id,
      kind,
      rq_id: p.rq_id || null,
      dimension: String(p.dimension || ''),
      wording: String(p.wording || ''),
      status: st.status,
      status_note: st.reason || null,
      proposed_status: proposed,
      source_ids: sourceIds,
      supporting_passage: p.supporting_passage ? String(p.supporting_passage) : null,
      passage_found_in_snapshot: needsQuote || p.supporting_passage ? matched : null,
      calculation: p.calculation || null,
      metric: p.metric && Number.isFinite(Number(p.metric.value)) ? { ...p.metric, value: Number(p.metric.value) } : null,
      data_period: p.data_period || null,
      materiality: clampInt(p.materiality, 1, 5, 3),
      decision_affected: p.decision_affected || null,
      contradictory_evidence: p.contradictory_evidence || null,
      verification_state: ['original', 'intermediary', 'unverified'].includes(p.verification_state) ? p.verification_state : 'unverified',
      next_verification_step: p.next_verification_step || null,
      depends_on: asArray(p.depends_on).map(String),
      best_tier: cited.length ? bestTier : null,
      _components: p.components,
      _penalties: asArray(p.penalties).filter((k) => MODEL_PENALTIES.has(k)),
    };
    claims.push(claim);
  }

  const byId = new Map(claims.map((c) => [c.claim_id, c]));
  // Calculations are computed by code; a formula that cannot be computed makes the claim a Hypothesis.
  for (const c of claims.filter((x) => x.status === 'Calculated')) {
    try {
      const vars = {};
      for (const [name, ref] of Object.entries(c.calculation?.inputs || {})) vars[name] = byId.get(ref)?.metric?.value;
      const result = evaluate(c.calculation?.formula, vars);
      const r = Number.isInteger(c.calculation?.rounding) ? Number(result.toFixed(c.calculation.rounding)) : result;
      c.calculation = { ...c.calculation, result: r, computed_by: 'code' };
      if (c.metric) c.metric.value = r;
      c.depends_on = [...new Set([...c.depends_on, ...Object.values(c.calculation.inputs || {})])];
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      c.status = 'Hypothesis';
      c.status_note = `calculation could not be reproduced: ${e.message}`;
      c.calculation = { ...(c.calculation || {}), result: null, error: e.message };
    }
  }

  study.contradictions = detectContradictions(claims, config.harness.contradictionTolerance);
  const contradicted = new Set(study.contradictions.flatMap((x) => x.claim_ids));

  for (const c of claims) {
    if (c.status === 'Not established') {
      c.confidence = null;
    } else {
      const cited = c.source_ids.map((sid) => srcById.get(sid));
      const origins = new Set(cited.map((s) => s.origin_source_id || s.source_id));
      const auto = [];
      if (c.verification_state === 'intermediary') auto.push('intermediary');
      if (cited.length > 1 && origins.size === 1) auto.push('single_origin');
      if (contradicted.has(c.claim_id)) auto.push('unresolved_contradiction');
      try {
        c.confidence = scoreConfidence(c._components, [...auto, ...c._penalties], rubric, { tier: c.best_tier });
      } catch (e) {
        if (!(e instanceof ScoringError)) throw e;
        c.confidence = null;
        c.status = 'Hypothesis';
        c.status_note = `score rejected: ${e.message}`;
      }
    }
    delete c._components;
    delete c._penalties;
  }
  for (const c of claims) {
    const inputs = c.depends_on.map((id) => byId.get(id)).filter(Boolean);
    Object.assign(c, applyInferenceCeiling(c, inputs, rubric, threshold));
  }
  study.validation_issues = issues;
  return claims;
}

/** Same metric (entity, measure, period) with values differing beyond tolerance = unresolved contradiction. */
export function detectContradictions(claims, tolerance) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const groups = new Map();
  for (const c of claims) {
    if (!c.metric || c.status === 'Not established') continue;
    const key = [norm(c.metric.entity), norm(c.metric.measure), norm(c.metric.period), norm(c.metric.unit)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const out = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const vals = group.map((c) => c.metric.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (hi === 0 ? lo !== 0 : (hi - lo) / Math.abs(hi) > tolerance) {
      out.push({ metric_key: key, claim_ids: group.map((c) => c.claim_id), values: vals, resolution: null, disclosed: true });
      for (const c of group) c.contradictory_evidence = group.filter((o) => o !== c).map((o) => o.claim_id).join(', ');
    }
  }
  return out;
}

/** v2 stage 03 exit: every material claim has a record; contradictions logged; calculations reproduced. */
export function exitCheck(study) {
  const reasons = [];
  const bad = study.claims.filter((c) => c.status === 'Calculated' && c.calculation?.result == null);
  if (bad.length) reasons.push(`calculations not reproduced: ${bad.map((c) => c.claim_id).join(', ')}`);
  return { pass: reasons.length === 0, reasons };
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
