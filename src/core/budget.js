// Per-study budgets from config (budgets.*). A study can carry approved raises in study.budget_overrides.
// Exceeding a budget stops the run with budget_exceeded; the runner turns that into a request for approval.
import { runError } from './errors.js';

export function createBudget(config) {
  const base = config.harness.budgets;
  const limit = (study, key) => study.budget_overrides?.[key] ?? base[key];
  const over = (key, used, max) => {
    if (max != null && used >= max) throw runError('budget_exceeded', `Budget ${key} reached (${used} of ${max})`, { cause: { key, used, max } });
  };
  return {
    checkTokens(study) {
      const u = study.usage || {};
      over('maxModelTokensPerStudy', (u.input_tokens || 0) + (u.output_tokens || 0), limit(study, 'maxModelTokensPerStudy'));
    },
    checkSearches(study) {
      over('maxSearchesPerStudy', study.usage?.searches || 0, limit(study, 'maxSearchesPerStudy'));
    },
    checkPages(study) {
      over('maxPagesFetchedPerStudy', study.usage?.pages || 0, limit(study, 'maxPagesFetchedPerStudy'));
    },
  };
}
