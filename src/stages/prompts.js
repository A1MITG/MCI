// Loads versioned stage prompts from /prompts. Versions are pinned in config/harness.config.json (prompts.*),
// and every model call records the version it used.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function loadPrompt(config, stage, vars = {}) {
  const version = config.harness.prompts[stage];
  const read = (name) => readFileSync(path.join(config.root, 'prompts', name), 'utf8');
  let body = read(`${stage}.${version}.md`);
  for (const [k, v] of Object.entries(vars)) body = body.replaceAll(`{{${k}}}`, v);
  return { id: `${stage}.${version}`, text: `${read('_shared.v1.md')}\n\n${body}` };
}

/** Wrap fetched content so the model treats it as data. Strips anything that looks like our own tags. */
export function untrustedSource(source, text, maxChars, terms = []) {
  const clean = excerpt(String(text).replace(/<\/?source[^>]*>/gi, ''), terms, maxChars);
  return `<source id="${source.source_id}" tier="${source.tier}" url="${source.url}" trust="untrusted">\n${clean}\n</source>`;
}

export function frameworkTable(frameworks) {
  return Object.entries(frameworks.questions)
    .map(([k, q]) => `  - ${k}: ${q.label} Tools: ${q.tools.join(', ')}`)
    .join('\n') + `\n  Always available: ${frameworks.alwaysAvailable.join(', ')}`;
}

export function rubricText(rubric) {
  return Object.entries(rubric.components)
    .map(([k, c]) => `  ${k} (0-${c.max}): ${c.question} ${c.anchors.map(([p, t]) => `${p}=${t}`).join('; ')}`)
    .join('\n');
}

export function recommendationRubricText(rubric) {
  return Object.entries(rubric.recommendation.components).map(([k, c]) => `  ${k} (0-${c.max}): ${c.question}`).join('\n');
}

/**
 * Long documents (annual reports, filings) do not fit in the model's budget per source, so keep the passages
 * that mention the study's terms, in document order, each tagged with its page. Short texts pass through whole.
 * Quotes are still checked against the full saved copy.
 */
export function excerpt(text, terms, maxChars, chunkChars = 1200) {
  if (text.length <= maxChars) return text;
  const words = [...new Set(terms.flatMap((t) => String(t || '').toLowerCase().match(/[a-z0-9][a-z0-9&.-]{2,}/g) || []))].filter((w) => !STOP.has(w));
  if (!words.length) return text.slice(0, maxChars);
  const chunks = [];
  let page = null;
  for (let i = 0; i < text.length; i += chunkChars) {
    const body = text.slice(i, i + chunkChars);
    const marks = [...body.matchAll(/\[page (\d+)\]/g)];
    const startPage = page;
    if (marks.length) page = marks.at(-1)[1];
    const lower = body.toLowerCase();
    const score = words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0) + (/\d/.test(body) ? 0.5 : 0);
    chunks.push({ i, body, score, startPage });
  }
  const picked = [];
  let used = 0;
  for (const c of [...chunks].sort((a, b) => b.score - a.score)) {
    if (c.score < 1 || used + c.body.length > maxChars) continue;
    picked.push(c);
    used += c.body.length + 40;
  }
  if (!picked.length) return text.slice(0, maxChars);
  return picked
    .sort((a, b) => a.i - b.i)
    .map((c) => `${c.startPage && !c.body.startsWith('[page') ? `[page ${c.startPage}, continued]\n` : ''}${c.body}`)
    .join('\n[…]\n');
}

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'does', 'doing', 'from', 'that', 'this', 'are', 'was', 'its', 'into', 'than', 'vs', 'versus', 'market', 'india', 'company']);
