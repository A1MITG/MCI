// Small server-side SVG charts. Every bar that shows a claim carries its claim ID, so clicking it
// opens the claim record. Colours come from THEME only: blues, amber, white.
import { THEME, LABEL_COLOURS } from './theme.js';
import { esc } from './html.js';

const FONT = `font-family="Inter, Segoe UI, Arial, sans-serif"`;

/** Horizontal bars. rows: [{label, value, max?, colour, claimId?, note?}] */
export function barChart(rows, { title, unit = '', width = 640, max } = {}) {
  if (!rows.length) return '';
  const rowH = 30;
  const labelW = 190;
  const valueW = 130;
  const plotW = width - labelW - valueW;
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value)) || 1;
  const h = rows.length * rowH + 8;
  const bars = rows.map((r, i) => {
    const y = i * rowH + 4;
    const w = Math.max(2, (r.value / top) * plotW);
    const attrs = r.claimId ? ` class="bar claim-link" data-claim="${esc(r.claimId)}" tabindex="0" role="button"` : ' class="bar"';
    return `<g${attrs}>
  <title>${esc(r.label)}: ${esc(fmt(r.value))}${esc(unit)}${r.claimId ? ` (${esc(r.claimId)})` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</title>
  <text x="${labelW - 10}" y="${y + 19}" text-anchor="end" font-size="13" fill="${THEME.ink}" ${FONT}>${esc(trim(r.label, 26))}</text>
  <rect x="${labelW}" y="${y + 4}" width="${plotW}" height="20" rx="3" fill="${THEME.wash}"/>
  <rect x="${labelW}" y="${y + 4}" width="${w.toFixed(1)}" height="20" rx="3" fill="${r.colour}" stroke="${r.colour === THEME.white || r.colour === THEME.light ? THEME.blue : 'none'}" stroke-width="1"/>
  <text x="${labelW + plotW + 8}" y="${y + 19}" font-size="13" fill="${THEME.ink}" ${FONT}>${esc(fmt(r.value))}${esc(unit)}${r.claimId ? ` · ${esc(r.claimId)}` : ''}</text>
</g>`;
  });
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${width} ${h}" width="100%" role="img" aria-label="${esc(title)}">${bars.join('')}</svg></figure>`;
}

/** Claim count by confidence label, plus Not established. */
export function evidenceMixChart(claims) {
  const live = claims.filter((c) => !c.removed);
  const rows = Object.entries(LABEL_COLOURS).map(([label, colour]) => ({ label, value: live.filter((c) => c.confidence?.label === label).length, colour }));
  rows.push({ label: 'Not established', value: live.filter((c) => c.status === 'Not established').length, colour: THEME.white });
  return barChart(rows.filter((r) => r.value > 0), { title: 'Claims by strength of evidence' });
}

/**
 * Metric comparisons: claims with the same measure, period and unit across two or more entities.
 * The subject's bar is navy, rivals blue, and any bar under 50 confidence is amber.
 */
export function metricCharts(claims, subjectName, limit = 3) {
  const groups = new Map();
  const aggregate = /^(industry|market|total|all)\b/i;
  for (const c of claims.filter((x) => !x.removed && x.metric && x.status !== 'Not established' && !aggregate.test(String(x.metric.entity)))) {
    const key = [c.metric.measure, c.metric.period, c.metric.unit].map((s) => String(s || '').toLowerCase().trim()).join('|');
    if (!groups.has(key)) groups.set(key, new Map());
    const byEntity = groups.get(key);
    const prev = byEntity.get(c.metric.entity);
    if (!prev || (c.confidence?.total ?? 0) > (prev.confidence?.total ?? 0)) byEntity.set(c.metric.entity, c);
  }
  const subject = String(subjectName || '').toLowerCase();
  return [...groups.values()]
    .filter((m) => m.size >= 2)
    .slice(0, limit)
    .map((m) => {
      const list = [...m.values()].sort((a, b) => b.metric.value - a.metric.value);
      const { measure, period, unit } = list[0].metric;
      return barChart(
        list.map((c) => ({
          label: c.metric.entity,
          value: c.metric.value,
          claimId: c.claim_id,
          note: c.confidence ? `${c.confidence.total} ${c.confidence.label}` : c.status,
          colour: (c.confidence?.total ?? 0) < 50 ? THEME.amber : String(c.metric.entity).toLowerCase().includes(subject) && subject ? THEME.navy : THEME.blue,
        })),
        { title: `${measure}${period ? `, ${period}` : ''}`, unit: unit ? ` ${unit}` : '' },
      );
    })
    .join('');
}

export function recommendationChart(recs) {
  const rows = recs.filter((r) => r.confidence).map((r) => ({ label: `${r.rec_id} ${r.action}`, value: r.confidence.total, max: 100, claimId: r.rec_id, colour: r.confidence.total < 50 ? THEME.amber : THEME.blue }));
  return barChart(rows, { title: 'Recommendation confidence (0-100)', max: 100 });
}

/** Fourteen squares: Pass blue, Partial amber outline, Fail solid amber. */
export function gateStrip(rows) {
  const size = 34;
  const cells = rows.map((r, i) => {
    const fill = r.result === 'Pass' ? THEME.blue : r.result === 'Fail' ? THEME.amber : THEME.white;
    const stroke = r.result === 'Pass' ? THEME.blue : THEME.amber;
    const txt = r.result === 'Pass' ? THEME.white : THEME.ink;
    return `<g><title>${r.n}. ${esc(r.check)}: ${r.result}${r.critical ? ' (critical)' : ''}</title>
<rect x="${i * (size + 6)}" y="2" width="${size}" height="${size}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${r.critical ? 3 : 1.5}"/>
<text x="${i * (size + 6) + size / 2}" y="${size / 2 + 7}" text-anchor="middle" font-size="13" font-weight="600" fill="${txt}" ${FONT}>${r.n}</text></g>`;
  });
  return `<svg viewBox="0 0 ${rows.length * (size + 6)} ${size + 6}" width="100%" style="max-width:${rows.length * (size + 6)}px" role="img" aria-label="Quality gate results">${cells.join('')}</svg>`;
}

function fmt(v) {
  return Number.isInteger(v) ? v.toLocaleString('en-IN') : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
const trim = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
