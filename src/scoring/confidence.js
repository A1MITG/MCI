// Evidence confidence (master prompt v2 section 6B) applied from config/scoring-rubric.json.
// Code owns the arithmetic: models propose component points, this module validates and totals them.

const COMPONENTS = ['authority', 'directness', 'corroboration', 'recency', 'consistency'];

export class ScoringError extends Error {}

export function labelFor(score, rubric) {
  if (score == null) return null;
  for (const [min, label] of rubric.labels) if (score >= min) return label;
  return rubric.labels.at(-1)[1];
}

export function penaltyPoints(keys, rubric) {
  return keys.map((key) => {
    const p = rubric.penalties[key];
    if (!p) throw new ScoringError(`Unknown penalty "${key}". Allowed: ${Object.keys(rubric.penalties).join(', ')}`);
    return { key, points: p.points, reason: p.rule };
  });
}

/**
 * Total a claim's confidence.
 * @param {object} components  {authority, directness, corroboration, recency, consistency}
 * @param {string[]} penaltyKeys  keys of rubric.penalties
 * @param {object} rubric
 * @param {{tier?: number}} [ctx]  best source tier, used for the authority band check
 * @returns {{components, penalties, total, label, warnings: string[]}}
 */
export function scoreConfidence(components, penaltyKeys, rubric, ctx = {}) {
  const warnings = [];
  for (const name of COMPONENTS) {
    const v = components?.[name];
    const max = rubric.components[name].max;
    if (!Number.isFinite(v)) throw new ScoringError(`Component "${name}" is missing or not a number`);
    if (v < 0 || v > max) throw new ScoringError(`Component "${name}" = ${v} is outside 0-${max}`);
  }
  const band = ctx.tier && rubric.components.authority.bandsByTier[String(ctx.tier)];
  if (band && (components.authority < band[0] || components.authority > band[1])) {
    warnings.push(`authority ${components.authority} is outside the tier ${ctx.tier} band ${band[0]}-${band[1]}`);
  }
  const penalties = penaltyPoints([...new Set(penaltyKeys || [])], rubric);
  const raw = COMPONENTS.reduce((s, n) => s + components[n], 0) + penalties.reduce((s, p) => s + p.points, 0);
  const [lo, hi] = rubric.clamp;
  const total = Math.max(lo, Math.min(hi, raw));
  return { components: pick(components, COMPONENTS), penalties, total, label: labelFor(total, rubric), warnings };
}

/** v2.1: an inference, estimate or hypothesis never scores above its weakest material input + 10. */
export function applyInferenceCeiling(claim, inputClaims, rubric, materialThreshold) {
  const rule = rubric.inferenceCeiling;
  if (!rule.appliesTo.includes(claim.status) || !claim.confidence) return claim;
  const material = inputClaims.filter((c) => c.materiality >= materialThreshold && c.confidence);
  if (!material.length) return claim;
  const ceiling = Math.min(...material.map((c) => c.confidence.total)) + rule.plus;
  if (claim.confidence.total <= ceiling) return claim;
  return {
    ...claim,
    confidence: { ...claim.confidence, total: ceiling, label: labelFor(ceiling, rubric), ceilingApplied: ceiling },
  };
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

export { COMPONENTS };
