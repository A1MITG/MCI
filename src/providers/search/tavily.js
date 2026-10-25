import { getJson, requireKey } from './http.js';

export function tavily({ key }) {
  return {
    name: 'tavily',
    async search(query, { maxResults = 8, signal } = {}) {
      requireKey('Tavily (TAVILY_API_KEY)', key);
      const data = await getJson('https://api.tavily.com/search', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: { query, max_results: maxResults, search_depth: 'basic' },
        signal,
      });
      return (data.results || []).map((r) => ({ url: r.url, title: r.title || '', snippet: r.content || '', published: r.published_date || null, provider: 'tavily' }));
    },
  };
}
