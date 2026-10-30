// 05 Challenge: the independent auditor. It gets a fresh context with only the draft and the registers,
// never the researcher's prompts or reasoning. Its verdicts are applied by code.
import { callModel, asArray, json } from './common.js';
import { claimDigest } from './analyse.js';

const SHAPE = `{"verdicts": [{"target": "C01|R01|finding:1", "verdict": "keep|downgrade|remove", "to_status": "", "reason": "",
  "alternatives": "", "counter_evidence": "", "assumptions": "", "verification_steps": ""}],
 "judged_checks": {"3": {"result": "Pass|Partial|Fail", "note": ""}, "6": {}, "7": {}, "8": {}, "10": {}, "12": {}, "13": {}},
 "counter_evidence_queries": [{"rq_id": "RQ1", "text": ""}]}`;

const JUDGED = ['3', '6', '7', '8', '10', '12', '13'];

export const challenge = {
  name: 'challenge',
  async execute(study, deps) {
    const draft = {
      question: study.inputs.question,
      perspective: study.inputs.perspective,
      scope: { decision: study.scope.decision, market_definition: study.scope.market_definition, competitor_criteria: study.scope.competitor_criteria, competitors: study.scope.competitors },
      findings: study.findings,
      frameworks_used: study.frameworks_used,
      recommendations: study.recommendations,
      contradictions: study.contradictions,
    };
    const register = study.sources.map(({ source_id, publisher, title, tier, published, url, origin_source_id }) => ({ source_id, publisher, title, tier, published, url, origin_source_id }));
    const out = await callModel(study, deps, 'challenge', {
      role: 'auditor',
      user: `Draft:\n${json(draft)}\n\nClaim register:\n${json(claimDigest(study.claims))}\n\nSource register:\n${json(register)}\n\nSearch log:\n${json(study.search_log.map((q) => ({ id: q.query_id, text: q.query_text, purpose: q.purpose })))}\n\nReply with JSON shaped like:\n${SHAPE}`,
    });
    applyVerdicts(study, out, deps.config);
    const known = new Set(study.claims.map((c) => c.claim_id));
    if (!study.challenge.verdicts.some((v) => known.has(v.target))) {
      await deps.emit('challenge_unparsed', { keys: Object.keys(out || {}), verdicts: asArray(verdictList(out)).length, sample: JSON.stringify(asArray(verdictList(out))[0] ?? null).slice(0, 300) });
    }
    const queries = asArray(out.counter_evidence_queries).filter((q) => q?.text);
    if (queries.length) study.pending_queries = queries.map((q) => ({ ...q, purpose: 'counter_evidence' }));
    return { study, outcome: queries.length ? 'needs_counter_evidence' : 'pass', exit: exitCheck(study) };
  },
};

export function applyVerdicts(study, out, config) {
  const byId = new Map(study.claims.map((c) => [c.claim_id, c]));
  const verdicts = asArray(verdictList(out)).map((v) => ({
    target: targetId(v),
    verdict: ['keep', 'downgrade', 'remove'].includes(String(v.verdict || '').toLowerCase()) ? String(v.verdict).toLowerCase() : 'keep',
    to_status: v.to_status || null,
    reason: String(v.reason || ''),
    alternatives: String(v.alternatives || ''),
    counter_evidence: String(v.counter_evidence || ''),
    assumptions: String(v.assumptions || ''),
    verification_steps: String(v.verification_steps || ''),
    applied: false,
  }));
  const order = config.rubric.statuses;
  for (const v of verdicts) {
    const c = byId.get(v.target);
    if (!c) continue;
    if (v.verdict === 'remove') {
      c.removed = true;
      c.removed_reason = v.reason;
      v.applied = true;
    } else if (v.verdict === 'downgrade' && order.includes(v.to_status) && order.indexOf(v.to_status) > order.indexOf(c.status)) {
      c.auditor_downgrade = { from: c.status, to: v.to_status, reason: v.reason };
      c.status = v.to_status;
      if (c.status === 'Not established') c.confidence = null;
      v.applied = true;
    }
  }
  const judged = {};
  for (const k of JUDGED) {
    const j = out.judged_checks?.[k];
    judged[k] = ['Pass', 'Partial', 'Fail'].includes(j?.result) ? { result: j.result, note: String(j.note || '') } : { result: 'Partial', note: 'Not assessed by the auditor' };
  }
  study.challenge = { verdicts, judged_checks: judged };
  // Findings and recommendations that now rest on removed claims lose those references.
  const live = new Set(study.claims.filter((c) => !c.removed).map((c) => c.claim_id));
  study.findings = study.findings.map((f) => ({ ...f, claim_ids: f.claim_ids.filter((id) => live.has(id)) })).filter((f) => f.claim_ids.length);
}

// Models sometimes name the list or the target field differently, or write "C01: ...". Accept those shapes; IDs are still checked against the register.
const verdictList = (out) => out?.verdicts ?? out?.audit ?? out?.claims ?? [];
function targetId(v) {
  const raw = String(v?.target ?? v?.claim_id ?? v?.id ?? v?.claim ?? '');
  return raw.match(/^\s*([CIEVR]\d{2,})\b/)?.[1] ?? raw.trim();
}

/** v2 stage 05 exit: each critical conclusion has counter-evidence, assumptions and verification steps listed. */
export function exitCheck(study) {
  const reasons = [];
  const covered = new Set(study.challenge.verdicts.map((v) => v.target));
  const critical = study.claims.filter((c) => !c.removed && c.materiality >= 4).map((c) => c.claim_id);
  const uncovered = critical.filter((id) => !covered.has(id));
  if (uncovered.length) reasons.push(`critical claims without an audit verdict: ${uncovered.join(', ')}`);
  return { pass: reasons.length === 0, reasons };
}
