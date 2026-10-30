import { getJson, requireKey } from './http.js';

export function brave({ key }) {
  return {
    name: 'brave',
    async search(query, { maxResults = 8, signal } = {}) {
      requireKey('Brave Search (BRAVE_API_KEY)', key);
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const data = await getJson(url, { headers: { 'x-subscription-token': key, accept: 'application/json' }, signal });
      return (data.web?.results || []).map((r) => ({ url: r.url, title: r.title || '', snippet: r.description || '', published: r.page_age || null, provider: 'brave' }));
    },
  };
}
