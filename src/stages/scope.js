// 01 Scope: research plan, then pause for the user's confirmation.
import { callModel, requireFields, asArray, json } from './common.js';
import { frameworkTable } from './prompts.js';

const SHAPE = `{"decision": "", "market_definition": "", "denominator": "", "unit_of_analysis": "", "geography": "", "period": "",
 "evidence_ceiling": "", "research_questions": [{"id": "RQ1", "text": "", "question_type": "", "frameworks": [""]}],
 "competitor_criteria": [""], "competitors": [{"name": "", "reason": ""}], "official_domains": [""], "assumptions": [""],
 "confirmation": {"question": "", "options": ["", ""]}}`;

export const scope = {
  name: 'scope',
  async execute(study, deps) {
    const { frameworks } = deps.config;
    const out = await callModel(study, deps, 'scope', {
      vars: { FRAMEWORK_TABLE: frameworkTable(frameworks) },
      user: `Study inputs:\n${json(study.inputs)}\n\nReply with JSON shaped like:\n${SHAPE}`,
    });
    requireFields('scope', out, ['decision', 'market_definition', 'research_questions', 'competitor_criteria', 'confirmation']);

    const warnings = [];
    const rqs = asArray(out.research_questions).map((rq, i) => {
      const q = frameworks.questions[rq.question_type];
      const allowed = new Set([...(q?.tools || []), ...frameworks.alwaysAvailable]);
      const chosen = asArray(rq.frameworks).filter((f) => allowed.has(f));
      const dropped = asArray(rq.frameworks).filter((f) => !allowed.has(f));
      if (!q) warnings.push(`RQ${i + 1}: unknown question_type "${rq.question_type}"`);
      if (dropped.length) warnings.push(`RQ${i + 1}: dropped frameworks not in the library for this question: ${dropped.join(', ')}`);
      return { id: rq.id || `RQ${i + 1}`, text: String(rq.text || ''), question_type: q ? rq.question_type : null, frameworks: chosen };
    });

    study.scope = {
      decision: String(out.decision),
      market_definition: String(out.market_definition),
      denominator: String(out.denominator || ''),
      unit_of_analysis: String(out.unit_of_analysis || ''),
      geography: String(out.geography || study.inputs.geography || ''),
      period: String(out.period || study.inputs.period || ''),
      evidence_ceiling: String(out.evidence_ceiling || ''),
      research_questions: rqs,
      competitor_criteria: asArray(out.competitor_criteria).map(String),
      competitors: asArray(out.competitors).map((c) => ({ name: String(c.name || ''), reason: String(c.reason || '') })),
      official_domains: asArray(out.official_domains).map(String),
      assumptions: asArray(out.assumptions).map(String),
      confirmation: { question: String(out.confirmation.question || ''), options: asArray(out.confirmation.options).slice(0, 2).map(String) },
      confirmed_by_user: null,
      warnings,
    };
    return { study, outcome: exitCheck(study.scope).pass ? 'pass' : 'fail', exit: exitCheck(study.scope) };
  },
};

/** v2 stage 01 exit check: decision and questions written; market definition and denominator; competitor criteria. */
export function exitCheck(s) {
  const reasons = [];
  if (!s.decision) reasons.push('no decision');
  if (!s.research_questions.length) reasons.push('no research questions');
  if (s.research_questions.some((q) => !q.question_type)) reasons.push('a research question has no valid question type');
  if (!s.market_definition || !s.denominator) reasons.push('market definition or denominator missing');
  if (!s.competitor_criteria.length) reasons.push('no competitor-selection criteria');
  if (s.confirmation.options.length !== 2) reasons.push('scope confirmation needs two options');
  return { pass: reasons.length === 0, reasons };
}
