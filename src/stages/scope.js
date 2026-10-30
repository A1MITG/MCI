// 01 Scope: research plan, then pause for the user's confirmation.
import { callModel, requireFields, asArray, json } from './common.js';
import { frameworkTable } from './prompts.js';
import { resolveQuestionType, questionTypeFromFrameworks, resolveFramework, normaliseId } from './resolve.js';

const SHAPE = `{"decision": "", "market_definition": "", "denominator": "", "unit_of_analysis": "", "geography": "", "period": "",
 "evidence_ceiling": "", "research_questions": [{"id": "RQ1", "text": "", "question_type": "", "frameworks": [""]}],
 "competitor_criteria": [""], "competitors": [{"name": "", "reason": ""}], "official_domains": [""], "assumptions": [""],
 "confirmation": {"question": "", "options": ["", ""]}}`;

export const scope = {
  name: 'scope',
  async execute(study, deps) {
    const { frameworks } = deps.config;
    const ask = (note = '') => callModel(study, deps, 'scope', {
      vars: { FRAMEWORK_TABLE: frameworkTable(frameworks) },
      user: `Study inputs:\n${json(study.inputs)}\n\nReply with JSON shaped like:\n${SHAPE}${note}`,
    });
    let scoped = readScope(await ask(), study, frameworks);
    let exit = exitCheck(scoped);
    if (!exit.pass) {
      // One corrective request that names what was wrong; the reply goes through the same checks.
      await deps.emit('scope_retry', { reasons: exit.reasons });
      const keys = Object.keys(frameworks.questions).join(', ');
      scoped = readScope(await ask(`\n\nYour previous reply was rejected: ${exit.reasons.join('; ')}. Fix these and reply again in full. question_type must be exactly one of: ${keys}. confirmation.options must have exactly two options.`), study, frameworks);
      exit = exitCheck(scoped);
    }
    study.scope = scoped;
    return { study, outcome: exit.pass ? 'pass' : 'fail', exit };
  },
};

function readScope(out, study, frameworks) {
  requireFields('scope', out, ['decision', 'market_definition', 'research_questions', 'competitor_criteria', 'confirmation']);
  const read = readQuestions(out, frameworks);
  const warnings = read.flatMap((q) => q.warnings);
  const rqs = read.map(({ warnings: _w, raw_type: _r, ...q }) => q);
  const unknown = read.filter((q) => !q.question_type).map((q) => `${q.id} has question_type ${JSON.stringify(q.raw_type ?? null)}`);
  return {
    decision: String(out.decision),
    market_definition: String(out.market_definition),
    denominator: String(out.denominator || ''),
    unit_of_analysis: String(out.unit_of_analysis || ''),
    geography: String(out.geography || study.inputs.geography || ''),
    period: String(out.period || study.inputs.period || ''),
    evidence_ceiling: String(out.evidence_ceiling || ''),
    research_questions: rqs,
    competitor_criteria: asArray(out.competitor_criteria).map(String),
    competitors: asArray(out.competitors).map((c) => (typeof c === 'string' ? { name: c, reason: '' } : { name: String(c?.name || ''), reason: String(c?.reason || '') })),
    official_domains: asArray(out.official_domains).map(String),
    assumptions: asArray(out.assumptions).map(String),
    confirmation: { question: String(out.confirmation?.question || ''), options: asArray(out.confirmation?.options).slice(0, 2).map(String) },
    confirmed_by_user: null,
    warnings,
    unknown_types: unknown,
  };
}

/** Research questions with question types and frameworks mapped onto the library; anything unmappable is reported. */
function readQuestions(out, frameworks) {
  return asArray(out.research_questions).map((rq, i) => {
    const warnings = [];
    const id = /^RQ\d+$/.test(normaliseId(rq.id)) ? normaliseId(rq.id) : `RQ${i + 1}`;
    const named = asArray(rq.frameworks).map(String);
    let type = resolveQuestionType(rq.question_type, frameworks);
    if (!type) {
      type = questionTypeFromFrameworks(named, frameworks);
      if (type) warnings.push(`${id}: question_type "${rq.question_type}" read as ${type} from its frameworks`);
      else warnings.push(`${id}: unknown question_type "${rq.question_type}"`);
    }
    const q = frameworks.questions[type];
    const allowed = [...(q?.tools || []), ...frameworks.alwaysAvailable];
    const chosen = [...new Set(named.map((f) => resolveFramework(f, allowed)).filter(Boolean))];
    const dropped = named.filter((f) => !resolveFramework(f, allowed));
    if (dropped.length) warnings.push(`${id}: dropped frameworks not in the library for this question: ${dropped.join(', ')}`);
    return { id, text: String(rq.text || ''), question_type: q ? type : null, frameworks: chosen, raw_type: rq.question_type, warnings };
  });
}

/** v2 stage 01 exit check: decision and questions written; market definition and denominator; competitor criteria. */
export function exitCheck(s) {
  const reasons = [];
  if (!s.decision) reasons.push('no decision');
  if (!s.research_questions.length) reasons.push('no research questions');
  if (s.research_questions.some((q) => !q.question_type)) reasons.push(`a research question has no valid question type (${(s.unknown_types || []).join('; ') || 'unknown'})`);
  if (!s.market_definition || !s.denominator) reasons.push('market definition or denominator missing');
  if (!s.competitor_criteria.length) reasons.push('no competitor-selection criteria');
  if (s.confirmation.options.length !== 2) reasons.push('scope confirmation needs two options');
  return { pass: reasons.length === 0, reasons };
}
