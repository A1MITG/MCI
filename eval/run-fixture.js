// Runs the synthetic Tata vs Mahindra study end to end with no network and no keys,
// then scores the three planted-error tests (master prompt v2 section 13).
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FileStudyStore } from '../src/store/study-store.js';
import { fixtureLLM } from '../src/providers/llm/fixture.js';
import { fixtureSearch } from '../src/providers/search/fixture.js';
import { fixtureFetcher } from '../src/providers/fetch/fetcher.js';
import { INPUTS, PAGES, RESPONSES, SEARCH } from './fixtures/tata-vs-mahindra.js';

export async function runFixtureStudy({ dataDir, pages = PAGES, responses = RESPONSES, inputs = INPUTS, store } = {}) {
  const dir = dataDir || (await mkdtemp(path.join(tmpdir(), 'vp-eval-')));
  const config = { ...loadConfig({ SEARCH_PROVIDER: 'fixture', LLM_PROVIDER: 'fixture', DATA_DIR: dir }) };
  config.harness = { ...config.harness, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 } };
  const harness = createHarness({
    config,
    store: store || new FileStudyStore(dir),
    llm: fixtureLLM({ responses }),
    search: fixtureSearch({ results: SEARCH }),
    fetcher: fixtureFetcher(pages),
  });
  const created = await harness.createStudy(inputs);
  let study = await harness.runner.run(created.study_id);
  if (study.state === 'needs_input' && study.pending_input?.type === 'scope_confirmation') {
    await harness.runner.answer(study.study_id, { choice: study.pending_input.options[0] });
    study = await harness.runner.run(study.study_id);
  }
  return { harness, study, dir };
}

export function plantedErrorResults(study) {
  const byId = Object.fromEntries(study.claims.map((c) => [c.claim_id, c]));
  const rq2 = study.scope.research_questions.find((q) => q.id === 'RQ2');
  return [
    {
      test: '(a) missing dataset -> Not established',
      pass: rq2?.evidence === 'Not established' && byId.C08?.status === 'Not established' && byId.C08?.confidence === null && study.report.disclosures.some((d) => d.startsWith('RQ2')),
    },
    {
      test: '(b) conflicting credible sources -> logged and disclosed',
      pass: study.contradictions.some((c) => c.claim_ids.includes('C05') && c.claim_ids.includes('C06')) && byId.C05?.confidence?.penalties.some((p) => p.key === 'unresolved_contradiction') && study.report.disclosures.some((d) => d.includes('contradiction')),
    },
    {
      test: '(c) false but plausible claim -> flagged and kept out of the report',
      pass: byId.C07?.status !== 'Verified' && byId.C07?.passage_found_in_snapshot === false && byId.C07?.removed === true && !reportProse(study.report).includes('C07'),
    },
  ];
}

/** The text a reader sees: answer, summary, limitations, sections and closing. */
export function reportProse(r) {
  return [r.answer, r.central_conclusion, r.major_uncertainty, ...r.limitations, ...r.sections.map((s) => s.body), ...Object.values(r.closing).flat()].join(' ');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { study, dir } = await runFixtureStudy();
  const results = plantedErrorResults(study);
  console.log(`Study ${study.study_id}: ${study.state}`);
  console.log(study.quality_gate?.summary || '');
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.test}`);
  console.log(`Planted-error pass rate: ${results.filter((r) => r.pass).length}/${results.length}`);
  console.log(`Report: ${path.join(dir, study.study_id, 'report.html')}`);
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}
