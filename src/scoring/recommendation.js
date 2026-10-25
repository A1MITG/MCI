// Recommendation confidence (v2 section 6D, components defined in rubric v2.1).
import { ScoringError, labelFor } from './confidence.js';

export function scoreRecommendation(components, untestedCriticalAssumptions, rubric) {
  const spec = rubric.recommendation;
  for (const [name, { max }] of Object.entries(spec.components)) {
    const v = components?.[name];
    if (!Number.isFinite(v) || v < 0 || v > max) throw new ScoringError(`Recommendation component "${name}" must be 0-${max}`);
  }
  const count = Math.min(2, Math.max(0, untestedCriticalAssumptions?.length || 0));
  const penalty = count * spec.penalties.untested_critical_assumption.points;
  const raw = Object.keys(spec.components).reduce((s, n) => s + components[n], 0) + penalty;
  const total = Math.max(0, Math.min(100, raw));
  return { components, untestedCriticalAssumptions: untestedCriticalAssumptions || [], penalty, total, label: labelFor(total, rubric) };
}
