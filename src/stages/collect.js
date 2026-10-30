// 02 Collect: the model plans queries; code runs search and fetch, saves page copies,
// tiers each source from the domain table and writes the search log itself.
import { callModel, asArray, nextId, json } from './common.js';
import { tierForUrl, domainOf } from '../scoring/status.js';
import { RunError } from '../core/errors.js';

const SHAPE = `{"queries": [{"rq_id": "RQ1", "text": "", "purpose": "evidence|counter_evidence"}]}`;

export const collect = {
  name: 'collect',
  async execute(study, deps) {
    const { config, store, search, fetcher, signal } = deps;
    const ctx = config.harness.context;
    study.sources = study.sources || [];
    study.search_log = study.search_log || [];
    study.inaccessible_sources = study.inaccessible_sources || [];

    const gaps = rqsWithoutStrongSource(study);
    const pending = asArray(study.pending_queries);
    let queries = pending;
    if (!pending.length) {
      const out = await callModel(study, deps, 'collect', {
        user: `Research questions:\n${json(study.scope.research_questions)}\nCompetitors: ${json(study.scope.competitors)}\nGeography: ${study.scope.geography}; period: ${study.scope.period}\n` +
          `Queries already run: ${json(study.search_log.map((q) => q.query_text))}\n` +
          (study.search_log.length ? `Gaps to fill (no tier 1-3 source yet): ${json(gaps)}\n` : '') +
          `\nReply with JSON shaped like:\n${SHAPE}`,
      });
      queries = asArray(out.queries);
    }
    study.pending_queries = [];

    const seen = new Set([...study.sources.map((s) => s.url), ...study.inaccessible_sources.map((s) => s.url)]);
    const seeds = asArray(study.seed_sources).filter((s) => !seen.has(s.url));
    study.seed_sources = [];
    let toolCalls = 0;
    const maxCalls = config.harness.loops.maxToolCallsPerStage;

    const keep = async (result, queryId) => {
      if (seen.has(result.url) || toolCalls >= maxCalls) return null;
      seen.add(result.url);
      deps.budget.checkPages(study);
      toolCalls += 1;
      try {
        const page = await fetcher.fetch(result.url, { signal });
        study.usage.pages += 1;
        const snap = await store.putSnapshot(study.study_id, { url: page.url, text: page.text, contentType: page.contentType, status: page.status, fetchedAt: page.fetchedAt });
        const source = {
          source_id: nextId('S', study.sources.map((s) => s.source_id)),
          publisher: domainOf(page.url),
          author: null,
          title: result.title || '',
          tier: tierForUrl(page.url, config.sourceTiers, study.scope.official_domains),
          published: result.published || null,
          data_period: null,
          accessed: page.fetchedAt,
          url: page.url,
          archived_url: null,
          not_archived_reason: 'Public archive not attempted; local hashed copy kept',
          sha256: snap.sha256,
          snapshot_path: snap.path,
          origin_source_id: null,
          language: null,
          format: page.contentType?.includes('pdf') ? 'pdf' : 'web',
          pages: page.pages ?? null,
          access_limitations: null,
          found_by: queryId,
        };
        study.sources.push(source);
        return source.source_id;
      } catch (e) {
        if (e instanceof RunError && !e.retryable) {
          study.inaccessible_sources.push({ url: result.url, reason: e.message, query_id: queryId });
          await deps.emit('source_inaccessible', { url: result.url, reason: e.message });
          return null;
        }
        throw e;
      }
    };

    for (const s of seeds) await keep(s, 'seed');

    for (const q of queries) {
      if (toolCalls >= maxCalls) break;
      deps.budget.checkSearches(study);
      const qid = nextId('Q', study.search_log.map((x) => x.query_id));
      const results = await search.search(String(q.text), { signal });
      study.usage.searches += 1;
      toolCalls += 1;
      const kept = [];
      for (const r of results.slice(0, ctx.resultsFetchedPerQuery)) {
        const id = await keep(r, qid);
        if (id) kept.push(id);
      }
      study.search_log.push({
        query_id: qid,
        query_text: String(q.text),
        engine: search.name,
        date: new Date().toISOString(),
        results_reviewed: results.length,
        sources_kept: kept,
        purpose: q.purpose === 'counter_evidence' ? 'counter_evidence' : 'evidence',
        rq_ids: q.rq_id ? [String(q.rq_id)] : [],
      });
    }
    await deps.emit('collect_done', { sources: study.sources.length, queries: study.search_log.length, inaccessible: study.inaccessible_sources.length });
    const exit = exitCheck(study);
    return { study, outcome: 'pass', exit };
  },
};

/** RQs whose found sources include no tier 1-3 source. */
export function rqsWithoutStrongSource(study) {
  const byRq = new Map(study.scope.research_questions.map((q) => [q.id, false]));
  const queryRqs = new Map((study.search_log || []).map((q) => [q.query_id, q.rq_ids]));
  for (const s of study.sources || []) {
    if (s.tier > 3) continue;
    for (const rq of queryRqs.get(s.found_by) || []) byRq.set(rq, true);
  }
  return [...byRq].filter(([, ok]) => !ok).map(([id]) => id);
}

/** v2 stage 02 exit: each RQ has a tier 1-3 source or is marked Not established; search log complete. */
export function exitCheck(study) {
  const missing = rqsWithoutStrongSource(study);
  study.scope.research_questions.forEach((q) => {
    q.evidence = missing.includes(q.id) ? 'Not established' : 'Has tier 1-3 source';
  });
  return { pass: true, reasons: missing.map((id) => `${id} marked Not established (no tier 1-3 source)`) };
}
