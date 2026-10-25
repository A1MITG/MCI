// Offline search for tests and evals: results come from a fixture map {query -> results[]} or a function.
export function fixtureSearch({ results = {} } = {}) {
  return {
    name: 'fixture',
    async search(query) {
      const hit = typeof results === 'function' ? results(query) : results[query] || results['*'] || [];
      return hit.map((r) => ({ published: null, snippet: '', ...r, provider: 'fixture' }));
    },
  };
}
