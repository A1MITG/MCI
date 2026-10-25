// Renders a study as one self-contained, interactive HTML file: white page, blue accents,
// limitations on page one, claim pills that open the claim and its sources, filterable registers,
// and print styles for PDF export. No external requests.
import { THEME, BRAND } from './theme.js';
import { esc, withPills, pill, jsonForScript } from './html.js';
import { evidenceMixChart, metricCharts, recommendationChart, gateStrip } from './charts.js';

const STATE_BANNER = {
  published: { text: 'Published. Passes all critical quality checks.', tone: 'ok' },
  published_with_gaps: { text: 'Published with gaps. Passes all critical checks; partial results are disclosed below.', tone: 'gap' },
  gate_blocked: { text: 'Blocked draft. A critical quality check failed. Not for distribution.', tone: 'block' },
  confirmed: { text: 'Re-checked. No material change since the prior study; evidence carried forward.', tone: 'ok' },
};

export function renderReport(study, { config, events = [] } = {}) {
  const r = study.report || {};
  const claims = study.claims || [];
  const live = claims.filter((c) => !c.removed);
  const banner = STATE_BANNER[study.state] || { text: `Draft (${study.state})`, tone: 'gap' };
  const subject = study.inputs?.subject?.name || '';
  const title = study.inputs?.title || study.inputs?.question || 'Study';
  const data = {
    claims: Object.fromEntries(claims.map((c) => [c.claim_id, c])),
    recs: Object.fromEntries((study.recommendations || []).map((x) => [x.rec_id, x])),
    sources: Object.fromEntries((study.sources || []).map((s) => [s.source_id, s])),
  };
  const gate = study.quality_gate;
  const nav = [
    ['page-one', 'Page one'],
    ['summary', 'Summary'],
    ['charts', 'Evidence'],
    study.competitor_matrix && ['matrix', 'Competitors'],
    r.sections?.length && ['sections', 'Analysis'],
    study.recommendations?.length && ['recs', 'Recommendations'],
    ['closing', 'What we know'],
    gate && ['gate', 'Quality gate'],
    ['claims', 'Claims'],
    ['sources', 'Sources'],
    ['method', 'Method'],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${BRAND.product}</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true"></span><span><strong>${BRAND.product}</strong><small>${BRAND.parent}</small></span></div>
  <nav>${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
  <button type="button" class="print" onclick="window.print()">Save as PDF</button>
</header>
<main>
<section id="page-one" class="page-one">
  <p class="eyebrow">${esc(study.inputs?.perspective || '')} study · ${esc(subject)}${study.inputs?.me?.name ? ` · for ${esc(study.inputs.me.name)}` : ''} · v${esc(study.version)} · ${esc((study.updated_at || '').slice(0, 10))}</p>
  <h1>${esc(title)}</h1>
  <div class="banner ${banner.tone}">${esc(banner.text)}</div>
  ${r.answer ? `<p class="answer">${withPills(r.answer)}</p>` : ''}
  <div class="grid2">
    <div class="card"><h2>Limitations</h2>${list([...(r.limitations || []), ...(r.disclosures || [])], 'No limitations recorded.', true)}</div>
    <div class="card"><h2>Scope</h2>${scopeBlock(study.scope)}</div>
  </div>
</section>

<section id="summary">
  <h2>Executive summary</h2>
  <div class="grid3">
    <div class="tile"><h3>Central conclusion</h3><p>${withPills(r.central_conclusion || 'Not established')}</p></div>
    <div class="tile"><h3>Major uncertainty</h3><p>${withPills(r.major_uncertainty || 'Not established')}</p></div>
    <div class="tile"><h3>Evidence base</h3><p><strong>${live.length}</strong> claims · <strong>${(study.sources || []).length}</strong> sources · <strong>${(study.contradictions || []).length}</strong> open contradictions</p></div>
  </div>
  <h3>Key findings</h3>
  ${(study.findings || []).length ? `<ol class="findings">${study.findings.slice(0, 5).map((f) => `<li>${esc(f.text)} ${f.claim_ids.map(pill).join('')}</li>`).join('')}</ol>` : '<p class="muted">No findings met the evidence bar.</p>'}
</section>

<section id="charts">
  <h2>Evidence</h2>
  <div class="charts">${evidenceMixChart(claims)}${metricCharts(claims, subject)}${recommendationChart(study.recommendations || [])}</div>
</section>

${study.competitor_matrix ? matrixBlock(study.competitor_matrix) : ''}

${r.sections?.length ? `<section id="sections"><h2>Analysis</h2>${r.sections.map((s) => `<article><h3>${esc(s.title)}</h3><p>${withPills(s.body)}</p></article>`).join('')}</section>` : ''}

${study.recommendations?.length ? recsBlock(study.recommendations) : ''}

<section id="closing">
  <h2>What the evidence establishes</h2>
  <div class="grid3">
    ${closingTile('Establishes', r.closing?.establishes)}${closingTile('Suggests, not established', r.closing?.suggests)}${closingTile('Unknown', r.closing?.unknown)}
    ${closingTile('Evidence that would most help', r.closing?.best_next_evidence)}${closingTile('Decide now', r.closing?.decide_now)}${closingTile('Wait', r.closing?.wait)}
  </div>
</section>

${gate ? gateBlock(gate) : ''}

<section id="claims">
  <h2>Claim register</h2>
  <div class="filters">
    <input type="search" id="claim-search" placeholder="Search claims" aria-label="Search claims">
    <select id="claim-status" aria-label="Filter by status"><option value="">All statuses</option>${(config?.rubric?.statuses || []).map((s) => `<option>${esc(s)}</option>`).join('')}</select>
  </div>
  <div class="table-wrap"><table class="register" id="claim-table">
    <thead><tr><th>ID</th><th>Claim</th><th>Status</th><th>Confidence</th><th>Materiality</th><th>Sources</th></tr></thead>
    <tbody>${claims.map(claimRow).join('')}</tbody>
  </table></div>
</section>

<section id="sources">
  <h2>Source register</h2>
  <div class="table-wrap"><table class="register">
    <thead><tr><th>ID</th><th>Publisher</th><th>Title</th><th>Tier</th><th>Accessed</th><th>Copy</th></tr></thead>
    <tbody>${(study.sources || []).map((s) => `<tr id="src-${esc(s.source_id)}"><td>${esc(s.source_id)}</td><td>${esc(s.publisher)}</td><td><a href="${esc(safeUrl(s.url))}" rel="noopener noreferrer" target="_blank">${esc(s.title || s.url)}</a></td><td><span class="tier t${esc(s.tier)}">${esc(s.tier)}</span></td><td>${esc((s.accessed || '').slice(0, 10))}</td><td title="${esc(s.not_archived_reason || '')}">${s.archived_url ? `<a href="${esc(safeUrl(s.archived_url))}">archive</a>` : `sha256 ${esc((s.sha256 || '').slice(0, 10))}`}</td></tr>`).join('')}</tbody>
  </table></div>
  ${(study.inaccessible_sources || []).length ? `<h3>Inaccessible sources</h3>${list(study.inaccessible_sources.map((s) => `${s.url}: ${s.reason}`))}` : ''}
</section>

<section id="method">
  <h2>Method and AI-use disclosure</h2>
  <p>Methodology ${esc(r.methodology_version || config?.harness?.methodologyVersion || '')}. Frameworks used: ${(study.frameworks_used || []).map((f) => esc(f.name)).join(', ') || 'none'}.</p>
  ${(study.frameworks_excluded || []).length ? `<details><summary>Frameworks excluded (${study.frameworks_excluded.length})</summary>${list(study.frameworks_excluded.map((f) => `${f.name}: ${f.reason}`))}</details>` : ''}
  <pre class="disclosure">${esc(r.ai_use_disclosure || '')}</pre>
  <details><summary>Change log</summary>${list((study.change_log || []).map((c) => `v${c.version} · ${c.at?.slice(0, 16).replace('T', ' ')} · ${c.by}: ${c.summary}`))}</details>
  <details><summary>Run log (${events.length} events)</summary>${list(events.slice(-60).map((e) => `${e.at?.slice(11, 19)} ${e.type}${e.stage ? ` · ${e.stage}` : ''}${e.outcome ? ` → ${e.outcome}` : ''}`))}</details>
</section>
</main>

<aside id="panel" class="panel" aria-hidden="true" aria-labelledby="panel-title">
  <button type="button" class="close" aria-label="Close">×</button>
  <div id="panel-body"></div>
</aside>
<footer>${BRAND.product} · ${BRAND.parent} · Every number links to its claim record. Generated ${esc(new Date().toISOString().slice(0, 10))}.</footer>
<script type="application/json" id="study-data">${jsonForScript(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}

function scopeBlock(s) {
  if (!s) return '<p class="muted">Not scoped.</p>';
  const rows = [
    ['Decision', s.decision],
    ['Market', s.market_definition],
    ['Denominator', s.denominator],
    ['Geography and period', [s.geography, s.period].filter(Boolean).join(', ')],
    ['Evidence ceiling', s.evidence_ceiling],
    ['Scope choice', s.confirmed_by_user?.choice],
  ].filter(([, v]) => v);
  return `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  <h3>Research questions</h3><ul>${(s.research_questions || []).map((q) => `<li><strong>${esc(q.id)}</strong> ${esc(q.text)}${q.evidence === 'Not established' ? ' <span class="flag">Not established</span>' : ''}</li>`).join('')}</ul>`;
}

function matrixBlock(m) {
  return `<section id="matrix"><h2>Competitor matrix</h2><div class="table-wrap"><table class="matrix"><thead><tr><th></th>${m.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${m.rows.map((row, i) => `<tr><th>${esc(row)}</th>${m.columns.map((_, j) => {
    const cell = m.cells?.[i]?.[j] || { text: 'Not established', claim_ids: [] };
    const empty = !cell.claim_ids.length;
    return `<td class="${empty ? 'empty' : ''}">${esc(cell.text)} ${cell.claim_ids.map(pill).join('')}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}

function recsBlock(recs) {
  return `<section id="recs"><h2>Recommendations</h2><div class="table-wrap"><table class="register"><thead><tr><th>ID</th><th>Action</th><th>Owner</th><th>Timing / trigger</th><th>Risk of inaction</th><th>Confidence</th><th>Rests on</th></tr></thead>
  <tbody>${recs.map((x) => `<tr><td>${pill(x.rec_id)}</td><td>${esc(x.action)}</td><td>${esc(x.owner || '')}</td><td>${esc([x.timing, x.trigger].filter(Boolean).join(' · '))}</td><td>${esc(x.risk_of_inaction || '')}</td><td>${x.confidence ? `${score(x.confidence.total)} <small>${esc(x.confidence.label)}</small>` : '<span class="flag">Unscored</span>'}</td><td>${x.starting_fact_ids.map(pill).join('')}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function gateBlock(g) {
  return `<section id="gate"><h2>Quality gate</h2><p>${esc(g.summary)}</p>${gateStrip(g.rows)}
  <div class="table-wrap"><table class="register"><thead><tr><th>#</th><th>Check</th><th>Result</th><th>Note</th></tr></thead><tbody>
  ${g.rows.map((x) => `<tr><td>${x.n}${x.critical ? '<sup title="critical">*</sup>' : ''}</td><td>${esc(x.check)}</td><td><span class="res ${x.result.toLowerCase()}">${esc(x.result)}</span></td><td>${esc(x.note)}</td></tr>`).join('')}
  </tbody></table></div><p class="muted">* critical check: a Fail blocks publication.</p></section>`;
}

function claimRow(c) {
  const conf = c.confidence ? `${score(c.confidence.total)} <small>${esc(c.confidence.label)}</small>` : '<small>n/a</small>';
  return `<tr class="${c.removed ? 'removed' : ''}" data-status="${esc(c.status)}" data-text="${esc(`${c.claim_id} ${c.wording}`.toLowerCase())}"><td>${pill(c.claim_id)}</td><td>${esc(c.wording)}${c.removed ? ' <span class="flag">Removed by audit</span>' : ''}</td><td>${esc(c.status)}</td><td>${conf}</td><td>${esc(c.materiality)}</td><td>${(c.source_ids || []).map((s) => `<a href="#src-${esc(s)}">${esc(s)}</a>`).join(' ')}</td></tr>`;
}

const closingTile = (title, items) => `<div class="tile"><h3>${esc(title)}</h3>${list(items || [], 'Nothing recorded.', true)}</div>`;
const score = (n) => `<span class="score ${n >= 70 ? 'hi' : n >= 50 ? 'mid' : 'lo'}">${esc(n)}</span>`;
const list = (items, empty = 'None.', pills = false) => (items.length ? `<ul>${items.map((i) => `<li>${pills ? withPills(i) : esc(i)}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`);
const safeUrl = (u) => (/^https?:\/\//i.test(String(u)) ? u : '#');

const CSS = `
:root{--blue:${THEME.blue};--navy:${THEME.navy};--light:${THEME.light};--amber:${THEME.amber};--white:${THEME.white};--ink:${THEME.ink};--muted:${THEME.muted};--rule:${THEME.rule};--wash:${THEME.wash}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--white);color:var(--ink);font:15px/1.55 Inter,"Segoe UI",Arial,sans-serif}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:20px;padding:10px 24px;background:var(--white);border-bottom:3px solid var(--blue)}
.brand{display:flex;align-items:center;gap:10px}.brand small{display:block;color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase}
.mark{width:26px;height:26px;border-radius:50%;background:conic-gradient(var(--navy) 0 50%,var(--blue) 50% 75%,var(--light) 75%)}
nav{display:flex;gap:4px;overflow-x:auto;flex:1;min-width:0}nav a{color:var(--navy);text-decoration:none;padding:6px 10px;border-radius:6px;white-space:nowrap;font-size:13px}nav a:hover{background:var(--wash)}
.print{border:1px solid var(--blue);background:var(--white);color:var(--navy);border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;font-size:13px}
main{max-width:1080px;margin:0 auto;padding:16px 24px 64px}
section{padding:28px 0;border-bottom:1px solid var(--rule)}
h1{font-size:30px;line-height:1.2;color:var(--navy);margin:4px 0 14px}h2{color:var(--navy);font-size:21px;margin:0 0 14px}h3{font-size:15px;margin:14px 0 6px;color:var(--navy)}
.eyebrow{color:var(--muted);font-size:13px;margin:0}
.banner{padding:10px 14px;border-radius:8px;font-weight:600;margin:0 0 16px;border-left:6px solid var(--blue);background:var(--wash)}
.banner.gap{border-left-color:var(--amber)}.banner.block{border-left-color:var(--amber);background:#FFF7E0}
.answer{font-size:18px;line-height:1.55;max-width:860px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card,.tile{border:1px solid var(--rule);border-radius:10px;padding:14px 16px;background:var(--white)}.tile{border-top:3px solid var(--blue)}
.card h2{font-size:17px}dl{display:grid;grid-template-columns:150px 1fr;gap:4px 12px;margin:0}dt{color:var(--muted)}dd{margin:0}
ul,ol{padding-left:20px;margin:6px 0}li{margin:3px 0}
.pill{display:inline-block;border:1px solid var(--blue);background:var(--white);color:var(--navy);border-radius:999px;padding:0 8px;margin:0 2px;font:600 11px/18px Inter,Arial,sans-serif;cursor:pointer;vertical-align:1px}
.pill:hover,.pill:focus{background:var(--blue);color:var(--white);outline:none}
.flag{display:inline-block;background:#FFF2CC;color:#6B4E00;border-radius:4px;padding:0 6px;font-size:12px}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.chart{margin:0;border:1px solid var(--rule);border-radius:10px;padding:12px 16px}figcaption{font-weight:600;color:var(--navy);margin-bottom:6px}
.claim-link{cursor:pointer}.bar.claim-link:hover rect:last-of-type{opacity:.85}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
thead th{background:var(--wash);color:var(--navy);font-weight:600;position:sticky;top:0}
.matrix td.empty{color:var(--muted);background:repeating-linear-gradient(135deg,var(--white) 0 6px,var(--wash) 6px 12px)}
tr.removed td{color:var(--muted);text-decoration:line-through}tr.removed td:first-child,tr.removed td:nth-child(2) .flag{text-decoration:none}
.score{display:inline-block;min-width:30px;text-align:center;border-radius:4px;padding:0 4px;font-weight:600}.score.hi{background:var(--navy);color:var(--white)}.score.mid{background:var(--light);color:var(--navy)}.score.lo{background:var(--amber);color:var(--ink)}
.tier{display:inline-block;width:22px;text-align:center;border-radius:4px;background:var(--light);color:var(--navy);font-weight:600}.tier.t1,.tier.t2{background:var(--navy);color:var(--white)}.tier.t5{background:var(--amber);color:var(--ink)}
.res{font-weight:600;padding:0 6px;border-radius:4px}.res.pass{color:var(--navy);background:var(--light)}.res.partial{border:1px solid var(--amber)}.res.fail{background:var(--amber)}
.filters{display:flex;gap:10px;margin-bottom:10px}.filters input,.filters select{font:inherit;padding:6px 10px;border:1px solid var(--rule);border-radius:6px}.filters input{flex:1;min-width:0}.filters select{max-width:45%}
.muted{color:var(--muted)}pre.disclosure{white-space:pre-wrap;background:var(--wash);padding:12px;border-radius:8px;font:13px/1.5 ui-monospace,Menlo,monospace}
details{margin:8px 0}summary{cursor:pointer;color:var(--navy)}
.panel{position:fixed;top:0;right:0;height:100vh;width:min(440px,100vw);background:var(--white);border-left:3px solid var(--blue);box-shadow:-8px 0 24px rgba(0,97,160,.12);transform:translateX(105%);transition:transform .2s;z-index:10;overflow-y:auto;padding:22px}
.panel.open{transform:none}.panel .close{position:absolute;top:10px;right:12px;border:0;background:none;font-size:26px;color:var(--navy);cursor:pointer}
.panel dl{grid-template-columns:120px 1fr;font-size:13.5px}.panel blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--blue);background:var(--wash)}
footer{text-align:center;color:var(--muted);font-size:12px;padding:20px}
@media (max-width:760px){.grid2,.grid3{grid-template-columns:1fr}main{padding:12px 16px 48px}.top{padding:8px 16px;flex-wrap:wrap}.top nav{order:3;flex-basis:100%}.charts{grid-template-columns:1fr}dl{grid-template-columns:1fr}}
@media print{.top nav,.print,.panel,.filters{display:none}.top{position:static}section{break-inside:avoid-page}#page-one{break-after:page}.table-wrap{overflow:visible}thead th{position:static}a{color:inherit;text-decoration:none}}
`;

const SCRIPT = `(() => {
  const data = JSON.parse(document.getElementById('study-data').textContent);
  const panel = document.getElementById('panel'), body = document.getElementById('panel-body');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const row = (k, v) => v === null || v === undefined || v === '' ? '' : '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>';
  function sourceHtml(id) {
    const s = data.sources[id]; if (!s) return '';
    const url = /^https?:/i.test(s.url) ? s.url : '#';
    return '<li><strong>' + esc(id) + '</strong> tier ' + esc(s.tier) + ' · <a target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">' + esc(s.title || s.publisher) + '</a><br><small>' + esc(s.publisher) + ' · accessed ' + esc((s.accessed || '').slice(0, 10)) + ' · sha256 ' + esc((s.sha256 || '').slice(0, 12)) + '</small></li>';
  }
  function open(id) {
    const c = data.claims[id], r = data.recs[id];
    let html = '';
    if (c) {
      const conf = c.confidence;
      html = '<p class="eyebrow">' + esc(c.kind) + ' · ' + esc(c.rq_id || '') + '</p><h2 id="panel-title">' + esc(id) + '</h2><p>' + esc(c.wording) + '</p><dl>' +
        row('Status', esc(c.status) + (c.status_note ? '<br><small>' + esc(c.status_note) + '</small>' : '')) +
        row('Confidence', conf ? esc(conf.total) + ' · ' + esc(conf.label) : 'n/a') +
        row('Components', conf ? Object.entries(conf.components).map(([k, v]) => esc(k) + ' ' + esc(v)).join(', ') : '') +
        row('Penalties', conf && conf.penalties.length ? conf.penalties.map((p) => esc(p.key) + ' ' + esc(p.points)).join(', ') : '') +
        row('Ceiling', conf && conf.ceilingApplied ? 'capped at ' + esc(conf.ceilingApplied) + ' (weakest input + 10)' : '') +
        row('Materiality', esc(c.materiality)) +
        row('Calculation', c.calculation && c.calculation.formula ? esc(c.calculation.formula) + ' = ' + esc(c.calculation.result) : '') +
        row('Contradicts', esc(c.contradictory_evidence || '')) +
        row('Next check', esc(c.next_verification_step || '')) +
        row('Audit', c.removed ? 'Removed: ' + esc(c.removed_reason) : c.auditor_downgrade ? 'Downgraded from ' + esc(c.auditor_downgrade.from) + ': ' + esc(c.auditor_downgrade.reason) : '') +
        '</dl>' + (c.supporting_passage ? '<h3>Supporting passage</h3><blockquote>' + esc(c.supporting_passage) + '</blockquote><small>' + (c.passage_found_in_snapshot ? 'Found in the saved copy of the source.' : 'Not found in the saved copy.') + '</small>' : '') +
        (c.source_ids.length ? '<h3>Sources</h3><ul>' + c.source_ids.map(sourceHtml).join('') + '</ul>' : '') +
        (c.depends_on && c.depends_on.length ? '<h3>Rests on</h3><p>' + c.depends_on.map((d) => '<button class="pill claim-link" data-claim="' + esc(d) + '">' + esc(d) + '</button>').join('') + '</p>' : '');
    } else if (r) {
      html = '<p class="eyebrow">recommendation</p><h2 id="panel-title">' + esc(id) + '</h2><p>' + esc(r.action) + '</p><dl>' +
        row('Owner', esc(r.owner)) + row('Timing', esc(r.timing)) + row('Trigger', esc(r.trigger)) + row('Risk of inaction', esc(r.risk_of_inaction)) +
        row('Confidence', r.confidence ? esc(r.confidence.total) + ' · ' + esc(r.confidence.label) : 'Unscored') +
        row('Components', r.confidence ? Object.entries(r.confidence.components).map(([k, v]) => esc(k) + ' ' + esc(v)).join(', ') : '') +
        row('Weakest starting fact', esc(r.starting_fact_confidence)) + '</dl><h3>Rests on</h3><p>' +
        r.starting_fact_ids.map((d) => '<button class="pill claim-link" data-claim="' + esc(d) + '">' + esc(d) + '</button>').join('') + '</p>';
    } else return;
    body.innerHTML = html; panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); panel.querySelector('.close').focus();
  }
  const close = () => { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); };
  document.addEventListener('click', (e) => { const t = e.target.closest('.claim-link'); if (t) { e.preventDefault(); open(t.dataset.claim); } else if (e.target.closest('.close')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); const t = e.target.closest && e.target.closest('.claim-link'); if (t && e.key === 'Enter') open(t.dataset.claim); });
  const q = document.getElementById('claim-search'), st = document.getElementById('claim-status');
  const filter = () => { const term = q.value.trim().toLowerCase(), s = st.value; document.querySelectorAll('#claim-table tbody tr').forEach((tr) => { tr.hidden = (term && !tr.dataset.text.includes(term)) || (s && tr.dataset.status !== s); }); };
  q.addEventListener('input', filter); st.addEventListener('change', filter);
})();`;
