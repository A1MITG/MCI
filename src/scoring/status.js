// Evidence status rules (rubric statusRules) and source tiering (config/source-tiers.json).

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Tier a source by its domain. Official domains come from Scope; the model's own tier is never trusted above the map. */
export function tierForUrl(url, sourceTiers, officialDomains = []) {
  const host = domainOf(url);
  if (!host) return sourceTiers.unknownDomainTier;
  const match = (d) => host === d || host.endsWith(`.${d}`);
  for (const [d, tier] of Object.entries(sourceTiers.domains)) if (match(d)) return tier;
  if (sourceTiers.signalDomains.some(match)) return 5;
  if (officialDomains.some((d) => match(d.toLowerCase()))) return sourceTiers.officialCompanyDomainTier;
  return sourceTiers.unknownDomainTier;
}

/** Normalise text for the quote check: case, whitespace, quotes, dashes and digit-group commas. */
export function normaliseForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function passageFound(passage, snapshotText) {
  const p = normaliseForMatch(passage);
  if (p.length < 8) return false;
  return normaliseForMatch(snapshotText).includes(p);
}

/**
 * Decide the status code allows, given the proposed status and the evidence.
 * Returns {status, downgradedFrom?, reason?}.
 */
export function enforceStatus(proposed, { bestTier, passageMatched, structuredFiling }) {
  if (proposed === 'Verified') {
    if (structuredFiling) return { status: 'Verified' };
    if (bestTier <= 2 && passageMatched) return { status: 'Verified' };
    const reason = bestTier > 2 ? `best source is tier ${bestTier}` : 'supporting passage not found in the saved copy';
    return { status: bestTier <= 4 ? 'Reported' : 'Hypothesis', downgradedFrom: 'Verified', reason };
  }
  if (proposed === 'Reported' && !passageMatched && !structuredFiling) {
    return { status: 'Hypothesis', downgradedFrom: 'Reported', reason: 'supporting passage not found in the saved copy' };
  }
  return { status: proposed };
}
