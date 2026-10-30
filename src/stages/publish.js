// 06 Publish: the model writes the prose; code checks every claim ID in it, removes sentences that carry
// numbers without a claim ID, adds the disclosures, writes the AI-use disclosure from the event log,
// and runs the quality gate, which decides the outcome.
import { callModel, asArray, json } from './common.js';
import { claimDigest } from './analyse.js';
import { runQualityGate } from '../gates/quality-gate.js';

const SHAPE = `{"answer": "", "central_conclusion": "", "major_uncertainty": "", "limitations": [""],
 "sections": [{"n": 2, "title": "", "body": ""}],
 "closing": {"establishes": [""], "suggests": [""], "unknown": [""], "best_next_evidence": [""], "decide_now": [""], "wait": [""]}}`;

const CLAIM_REF = /\[([CIEVR]\d{2,})(?:\s*[,;]\s*([CIEVR]\d{2,}))*\]/g;

export const publish = {
  name: 'publish',
  async execute(study, deps) {
    const out = await callModel(study, deps, 'publish', {
      user: `Question: ${study.inputs.question}\nScope: ${json({ decision: study.scope.decision, market_definition: study.scope.market_definition, evidence_ceiling: study.scope.evidence_ceiling })}\n` +
        `Findings: ${json(study.findings)}\nFrameworks: ${json(study.frameworks_used)}\nRecommendations: ${json(study.recommendations)}\n` +
        `Claims: ${json(claimDigest(study.claims))}\nContradictions: ${json(study.contradictions)}\n\nReply with JSON shaped like:\n${SHAPE}`,
    });
    study.report = buildReport(study, out, await deps.store.events(study.study_id), deps.config);
    study.quality_gate = runQualityGate(study, deps.config);
    return { study, outcome: study.quality_gate.outcome, exit: { pass: study.quality_gate.outcome !== 'gate_blocked', reasons: [study.quality_gate.summary] } };
  },
};

export function buildReport(study, out, events, config) {
  const live = new Set(study.claims.filter((c) => !c.removed).map((c) => c.claim_id));
  for (const r of study.recommendations || []) live.add(r.rec_id);
  const issues = [];
  const removedSentences = [];

  const clean = (text, where) => {
    const kept = [];
    for (const sentence of splitSentences(String(text || ''))) {
      const refs = [...sentence.matchAll(CLAIM_REF)].flatMap((m) => m[0].slice(1, -1).split(/[,;]/).map((s) => s.trim()));
      const bad = refs.filter((id) => !live.has(id));
      let s = sentence;
      if (bad.length) {
        issues.push(`${where}: unknown or removed claim IDs ${bad.join(', ')}`);
        for (const id of bad) s = s.replace(new RegExp(`\\s*\\[${id}\\]|${id}\\s*[,;]\\s*|\\s*[,;]\\s*${id}(?=\\])`, 'g'), '');
      }
      const goodRefs = refs.filter((id) => live.has(id));
      if (hasNumber(s) && !goodRefs.length) {
        removedSentences.push({ where, sentence: s.trim() });
        continue;
      }
      kept.push(s);
    }
    return kept.join(' ').trim();
  };

  const gaps = (study.scope.research_questions || []).filter((q) => q.evidence === 'Not established');
  const disclosures = [
    ...gaps.map((q) => `${q.id} (${q.text}): Not established. No tier 1-3 source was found.`),
    ...(study.inaccessible_sources || []).map((s) => `Inaccessible source: ${s.url} (${String(s.reason).replaceAll(s.url, 'this page')})`),
    ...(study.contradictions || []).map((c) => `Unresolved contradiction between ${c.claim_ids.join(' and ')} (values ${c.values.join(' vs ')}).`),
    ...(study.loop_limits_hit || []).map((k) => `Loop limit reached on ${k}; remaining gaps are disclosed rather than researched further.`),
    ...sourceShortfall(study, config),
  ];

  return {
    answer: clean(out.answer, 'answer'),
    central_conclusion: clean(out.central_conclusion, 'central_conclusion'),
    major_uncertainty: clean(out.major_uncertainty, 'major_uncertainty'),
    limitations: [...asArray(out.limitations).map((l, i) => clean(l, `limitation ${i + 1}`)).filter(Boolean), ...(study.report?.limitations || [])],
    disclosures,
    sections: asArray(out.sections).map((s) => ({ n: Number(s.n) || null, title: String(s.title || ''), body: clean(s.body, `section ${s.n}`) })).filter((s) => s.body),
    closing: Object.fromEntries(['establishes', 'suggests', 'unknown', 'best_next_evidence', 'decide_now', 'wait'].map((k) => [k, asArray(out.closing?.[k]).map((x) => clean(x, `closing.${k}`)).filter(Boolean)])),
    ai_use_disclosure: aiUseDisclosure(events, config),
    uncited_numbers_removed: removedSentences,
    publish_issues: issues,
    methodology_version: config.harness.methodologyVersion,
  };
}

/** v2.1: the per-depth source budget is a target; a shortfall is disclosed on page one. */
export function sourceShortfall(study, config) {
  const target = config.harness.depthSourceTargets[study.inputs.depth]?.[0];
  const n = (study.sources || []).length;
  return target && n < target ? [`Source target for ${study.inputs.depth} depth is ${target}; this study used ${n}.`] : [];
}

/** The disclosure is written from the event log, not by the model. */
export function aiUseDisclosure(events, config) {
  const calls = events.filter((e) => e.type === 'model_call');
  const byStage = {};
  for (const c of calls) {
    const s = (byStage[c.stage] ||= { calls: 0, input: 0, output: 0, prompt: c.prompt, model: c.usage?.model });
    s.calls += 1;
    s.input += c.usage?.input_tokens || 0;
    s.output += c.usage?.output_tokens || 0;
  }
  const lines = Object.entries(byStage).map(([stage, s]) => {
    const tier = config.harness.models.stageTier[stage];
    return `${stage}: ${s.calls} call(s) to ${s.model || config.harness.models[tier]} (${tier} tier), prompt ${s.prompt}, ${s.input} input and ${s.output} output tokens`;
  });
  return [
    'AI models drafted the research plan, proposed queries, extracted claim records, applied frameworks, audited the draft and wrote the prose.',
    'Code, not the model, assigned source tiers, checked every quote against the saved page, enforced statuses, recomputed calculations, totalled confidence scores, detected contradictions and ran the quality gate.',
    'The challenge stage ran as an independent auditor with a fresh context.',
    ...lines,
  ].join('\n');
}

export function splitSentences(text) {
  return text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) || [];
}

/** A number that needs a claim ID: anything but years, fiscal-year labels and the claim IDs themselves. */
export function hasNumber(sentence) {
  const stripped = sentence
    .replace(CLAIM_REF, '')
    .replace(/\b(?:FY|CY|Q[1-4]\s?FY)\s?'?\d{2,4}\b/gi, '')
    .replace(/\b(?:19|20)\d{2}(?:-\d{2})?\b/g, '')
    .replace(/\b(?:RQ|Q|S|P)\d+\b/g, '');
  return /\d/.test(stripped);
}
