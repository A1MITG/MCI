// Maps the model's loose spellings onto the fixed vocabularies in config: question types, framework names and
// register IDs. Code still decides: anything that cannot be mapped to a known value stays unknown and is handled
// by the caller exactly as before. Live models write "Is the market attractive?" for market_attractive,
// "Porter's Five Forces" for Five Forces and "C1" or "C01: share claim" for C01.

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** A question type key from frameworks.questions, from its key or its label in any case or spacing. */
export function resolveQuestionType(raw, frameworks) {
  const n = norm(raw);
  if (!n) return null;
  for (const [key, q] of Object.entries(frameworks.questions)) {
    if (norm(key) === n || norm(q.label) === n) return key;
  }
  return null;
}

/** The question type whose tools best cover the chosen frameworks, when the type itself could not be read. */
export function questionTypeFromFrameworks(names, frameworks) {
  let best = null;
  let bestHits = 0;
  for (const [key, q] of Object.entries(frameworks.questions)) {
    const hits = names.filter((n) => q.tools.some((t) => frameworkKey(t) === frameworkKey(n))).length;
    if (hits > bestHits) [best, bestHits] = [key, hits];
  }
  return best;
}

const FRAMEWORK_NOISE = /\b(porters?|the|analysis|framework|model|matrix analysis|assessment|tool)\b/g;
const ALIASES = { pestel: 'pestle', pest: 'pestle', 'jtbd': 'jobs to be done', 'tam sam som': 'market sizing', 'seven powers': '7 powers', 'blue ocean strategy canvas': 'strategy canvas' };
function frameworkKey(name) {
  const k = norm(name).replace(FRAMEWORK_NOISE, ' ').replace(/\s+/g, ' ').trim();
  return ALIASES[k] || k;
}

/** The canonical framework name from `allowed` that `raw` names, or null. */
export function resolveFramework(raw, allowed) {
  const k = frameworkKey(raw);
  if (!k) return null;
  for (const name of allowed) if (frameworkKey(name) === k) return name;
  return null;
}

/** "C1", "c01", "C01: text", "[C01]" -> "C01"; "RQ 1" -> "RQ1". Unrecognised input is returned trimmed. */
export function normaliseId(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^\[?\s*(RQ|[A-Z])\s*-?\s*0*(\d{1,4})\b/i);
  if (!m) return s;
  const prefix = m[1].toUpperCase();
  return prefix === 'RQ' ? `RQ${Number(m[2])}` : `${prefix}${String(Number(m[2])).padStart(2, '0')}`;
}
