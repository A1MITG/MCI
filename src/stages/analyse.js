// 04 Analyse: frameworks over validated claims only. Code checks every cited claim ID and
// every framework against the question-driven library, and scores recommendations.
import { callModel, asArray, nextId, json } from './common.js';
import { recommendationRubricText } from './prompts.js';
import { scoreRecommendation, } from '../scoring/recommendation.js';
import { ScoringError } from '../scoring/confidence.js';

const SHAPE = `{"frameworks_used": [{"name": "", "rq_id": "RQ1", "conclusion": "", "claim_ids": ["C01"]}],
 "frameworks_excluded": [{"name": "", "reason": ""}],
 "dimensions": [{"n": 1, "status": "Analysed|Partially analysed|Not applicable|Not established", "note": ""}],
 "findings": [{"text": "", "claim_ids": ["C01"]}],
 "competitor_matrix": {"rows": ["Subject", "Rival"], "columns": ["Pricing"], "cells": [[{"text": "", "claim_ids": []}]]},
 "recommendations": [{"action": "", "owner": "", "timing": "", "trigger": "", "risk_of_inaction": "", "starting_fact_ids": ["C01"], "materiality": 4,
   "untested_assumptions": [""], "components": {"demand": 0, "economics": 0, "competitor_response": 0, "feasibility": 0, "reversibility": 0}}],
 "predictions": [{"statement": "", "check_by": "YYYY-MM", "falsifier": ""}]}`;

export function claimDigest(claims) {
  return claims
    .filter((c) => !c.removed)
    .map((c) => ({ id: c.claim_id, rq: c.rq_id, wording: c.wording, status: c.status, confidence: c.confidence?.total ?? null, materiality: c.materiality, metric: c.metric }));
}

export const analyse = {
  name: 'analyse',
  async execute(study, deps) {
    const { config } = deps;
    const out = await callModel(study, deps, 'analyse', {
      vars: { RECOMMENDATION_RUBRIC: recommendationRubricText(config.rubric) },
      user: `Perspective: ${study.inputs.perspective}. Subject: ${study.inputs.subject?.name}. Me: ${study.inputs.me?.name || 'n/a'}.\n` +
        `Research questions and their allowed frameworks:\n${json(study.scope.research_questions)}\nCompetitors: ${json(study.scope.competitors)}\n` +
        `Claims:\n${json(claimDigest(study.claims))}\n\nReply with JSON shaped like:\n${SHAPE}`,
    });
    Object.assign(study, commitAnalysis(study, out, config));
    const exit = exitCheck(study);
    return { study, outcome: 'pass', exit };
  },
};

export function commitAnalysis(study, out, config) {
  const ids = new Set(study.claims.filter((c) => !c.removed).map((c) => c.claim_id));
  const byId = new Map(study.claims.map((c) => [c.claim_id, c]));
  const keepIds = (list) => asArray(list).map(String).filter((id) => ids.has(id));
  const rqTools = new Map(study.scope.research_questions.map((q) => [q.id, new Set([...(config.frameworks.questions[q.question_type]?.tools || []), ...config.frameworks.alwaysAvailable])]));
  const issues = [];
  const used = [];
  const excluded = asArray(out.frameworks_excluded).map((f) => ({ name: String(f.name), reason: String(f.reason || '') }));
  for (const f of asArray(out.frameworks_used)) {
    const allowed = rqTools.get(f.rq_id);
    const claimIds = keepIds(f.claim_ids);
    if (!allowed?.has(f.name)) {
      excluded.push({ name: String(f.name), reason: `Not in the framework library for ${f.rq_id || 'an unknown question'}` });
      continue;
    }
    if (!claimIds.length) {
      excluded.push({ name: String(f.name), reason: 'Conclusion cited no valid claim IDs' });
      continue;
    }
    used.push({ name: f.name, rq_id: f.rq_id, conclusion: String(f.conclusion || ''), claim_ids: claimIds });
  }

  const recommendations = [];
  for (const r of asArray(out.recommendations)) {
    const rid = nextId('R', recommendations.map((x) => x.rec_id));
    const starting = keepIds(r.starting_fact_ids);
    const startConf = starting.map((id) => byId.get(id)?.confidence?.total).filter(Number.isFinite);
    let confidence = null;
    try {
      confidence = scoreRecommendation(r.components, asArray(r.untested_assumptions), config.rubric);
    } catch (e) {
      if (!(e instanceof ScoringError)) throw e;
      issues.push(`${rid}: ${e.message}`);
    }
    recommendations.push({
      rec_id: rid,
      action: String(r.action || ''),
      owner: r.owner || null,
      timing: r.timing || null,
      trigger: r.trigger || null,
      risk_of_inaction: r.risk_of_inaction || null,
      starting_fact_ids: starting,
      starting_fact_confidence: startConf.length ? Math.min(...startConf) : null,
      confidence,
      materiality: Math.max(1, Math.min(5, Math.round(Number(r.materiality)) || 3)),
    });
  }

  const m = out.competitor_matrix;
  const matrix = m && Array.isArray(m.rows) && Array.isArray(m.columns)
    ? { rows: m.rows.map(String), columns: m.columns.map(String), cells: asArray(m.cells).map((row) => asArray(row).map((cell) => ({ text: String(cell?.text || 'Not established'), claim_ids: keepIds(cell?.claim_ids) }))) }
    : null;

  return {
    frameworks_used: used,
    frameworks_excluded: excluded,
    dimensions: asArray(out.dimensions).map((d) => ({ n: Number(d.n), status: String(d.status || 'Not established'), note: String(d.note || '') })),
    findings: asArray(out.findings).map((f) => ({ text: String(f.text || ''), claim_ids: keepIds(f.claim_ids) })).filter((f) => f.claim_ids.length),
    competitor_matrix: matrix,
    recommendations,
    predictions: asArray(out.predictions).map((p, i) => ({ pred_id: `P${i + 1}`, statement: String(p.statement || ''), check_by: String(p.check_by || ''), falsifier: String(p.falsifier || '') })),
    analysis_issues: issues,
  };
}

/** v2 stage 04 exit: frameworks used and excluded tables complete; each conclusion cites claim IDs. */
export function exitCheck(study) {
  const reasons = [];
  if (!study.frameworks_used.length) reasons.push('no framework produced a conclusion with valid claim IDs');
  return { pass: reasons.length === 0, reasons };
}
