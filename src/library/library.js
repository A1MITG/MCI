// Research library: before a new study, look up what has already been researched,
// re-check the prior study's material claims, and only redo the whole study when something material changed.
import { passageFound } from '../scoring/status.js';
import { createHash } from 'node:crypto';

const DONE = new Set(['published', 'published_with_gaps', 'confirmed']);

export function normaliseName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|pvt|private|inc|corp|corporation|plc|co)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The key that decides "same research": subject, perspective, "me" and geography. */
export function libraryKey(inputs) {
  return [inputs.perspective, normaliseName(inputs.subject?.name), normaliseName(inputs.me?.name), normaliseName(inputs.geography)].join('|');
}

/** Saved, finished studies on the same key, newest first. */
export async function findPrior(store, inputs, { excludeId } = {}) {
  const key = libraryKey(inputs);
  return (await store.list()).filter((s) => s.study_id !== excludeId && s.saved && DONE.has(s.state) && libraryKey(s.inputs) === key);
}

/**
 * Re-check a prior study's material claims against their sources as they are now.
 * deps.fetcher.fetch(url) -> {text}. Returns a report; `materialChange` decides redo vs reuse.
 */
export async function recheckPrior(prior, { fetcher, materialThreshold, signal, findNewer }) {
  const sources = new Map((prior.sources || []).map((s) => [s.source_id, s]));
  const material = (prior.claims || []).filter((c) => c.materiality >= materialThreshold && c.status !== 'Not established');
  const results = [];
  const fetched = new Map();
  for (const claim of material) {
    for (const sid of claim.source_ids || []) {
      const src = sources.get(sid);
      if (!src?.url) continue;
      if (!fetched.has(src.url)) {
        try {
          const page = await fetcher.fetch(src.url, { signal });
          fetched.set(src.url, { ok: true, text: page.text, sha256: createHash('sha256').update(page.text).digest('hex') });
        } catch (e) {
          fetched.set(src.url, { ok: false, error: e.message });
        }
      }
      const now = fetched.get(src.url);
      let outcome;
      if (!now.ok) outcome = 'unreachable';
      else if (now.sha256 === src.sha256) outcome = 'unchanged';
      else if (claim.supporting_passage && passageFound(claim.supporting_passage, now.text)) outcome = 'changed_page_passage_still_present';
      else outcome = 'passage_missing';
      results.push({ claim_id: claim.claim_id, source_id: sid, url: src.url, outcome });
    }
  }
  // Optional: ask search whether a newer period or a material update exists (e.g. a new quarter's results).
  if (findNewer) {
    for (const claim of material) {
      const hit = await findNewer(claim, { signal });
      if (hit?.newer) results.push({ claim_id: claim.claim_id, source_id: null, url: hit.url || null, outcome: 'newer_data', note: hit.note || '' });
    }
  }
  const changed = results.filter((r) => ['passage_missing', 'unreachable', 'newer_data'].includes(r.outcome));
  return {
    prior_study_id: prior.study_id,
    prior_version: prior.version,
    checked_claims: material.length,
    results,
    changed_claim_ids: [...new Set(changed.map((r) => r.claim_id))],
    materialChange: changed.length > 0,
  };
}
