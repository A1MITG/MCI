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
export function untrustedSource(source, text, maxChars) {
  const clean = String(text).replace(/<\/?source[^>]*>/gi, '').slice(0, maxChars);
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
