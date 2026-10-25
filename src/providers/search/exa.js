import { getJson, requireKey } from './http.js';

export function exa({ key }) {
  return {
    name: 'exa',
    async search(query, { maxResults = 8, signal } = {}) {
      requireKey('Exa (EXA_API_KEY)', key);
      const data = await getJson('https://api.exa.ai/search', { method: 'POST', headers: { 'x-api-key': key }, body: { query, numResults: maxResults }, signal });
      return (data.results || []).map((r) => ({ url: r.url, title: r.title || '', snippet: r.text || '', published: r.publishedDate || null, provider: 'exa' }));
    },
  };
}
