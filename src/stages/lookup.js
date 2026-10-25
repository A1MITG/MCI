// 00 Library check and recheck: reuse prior research when nothing material has changed.
import { findPrior, recheckPrior } from '../library/library.js';

export const lookup = {
  name: 'lookup',
  async execute(study, deps) {
    if (study.inputs.force_full_redo) {
      study.library = { prior_study_ids: [], decision: 'forced_full_redo' };
      return { study, outcome: 'no_prior' };
    }
    const prior = await findPrior(deps.store, study.inputs, { excludeId: study.study_id });
    study.library = { prior_study_ids: prior.map((p) => p.study_id) };
    await deps.emit('library_lookup', { found: prior.length });
    if (!prior.length) return { study, outcome: 'no_prior' };
    study.library.prior_study_id = prior[0].study_id;
    return { study, outcome: 'prior_found' };
  },
};

export const recheck = {
  name: 'recheck',
  async execute(study, deps) {
    const prior = await deps.store.get(study.library.prior_study_id);
    const report = await recheckPrior(prior, {
      fetcher: deps.fetcher,
      materialThreshold: deps.config.harness.materialThreshold,
      signal: deps.signal,
      findNewer: deps.findNewer,
    });
    study.library.recheck = report;
    await deps.emit('library_recheck', { prior: prior.study_id, changed: report.changed_claim_ids.length, checked: report.checked_claims });
    if (report.materialChange) {
      study.library.decision = 'full_redo';
      study.seed_sources = (prior.sources || []).map((s) => ({ url: s.url, title: s.title }));
      return { study, outcome: 'material_change' };
    }
    // Reuse: carry the prior evidence forward, stamped with this recheck.
    for (const k of ['scope', 'sources', 'search_log', 'claims', 'frameworks_used', 'frameworks_excluded', 'dimensions', 'findings', 'competitor_matrix', 'recommendations', 'predictions', 'challenge', 'quality_gate', 'report']) {
      if (prior[k] !== undefined) study[k] = prior[k];
    }
    study.library.decision = 'reused_prior';
    study.report = { ...(study.report || {}), limitations: [`Re-checked on ${new Date().toISOString().slice(0, 10)}: ${report.checked_claims} material claims, no material change since study ${prior.study_id} v${prior.version}.`, ...(study.report?.limitations || [])] };
    return { study, outcome: 'no_material_change' };
  },
};
