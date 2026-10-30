// Search provider registry. The provider is chosen by ONE setting: SEARCH_PROVIDER in .env (read in src/config.js).
// To add a provider: write an adapter that returns normalised results, and register it here.
import { tavily } from './tavily.js';
import { brave } from './brave.js';
import { exa } from './exa.js';
import { fixtureSearch } from './fixture.js';

const REGISTRY = { tavily, brave, exa, fixture: fixtureSearch };

/**
 * @returns {{name: string, search(query: string, opts?: {maxResults?: number, signal?: AbortSignal}): Promise<SearchResult[]>}}
 * SearchResult: {url, title, snippet, published, provider}
 */
export function createSearch(config, overrides = {}) {
  const name = config.providers.search;
  const factory = REGISTRY[name];
  if (!factory) throw new Error(`Unknown SEARCH_PROVIDER "${name}". Use one of: ${Object.keys(REGISTRY).join(', ')}`);
  return factory({ key: config.keys[name], ...overrides });
}

export const SEARCH_PROVIDERS = Object.keys(REGISTRY);
