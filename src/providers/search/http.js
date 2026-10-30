// Shared HTTP helper for search adapters: timeout, typed errors, JSON body.
import { runError } from '../../core/errors.js';

export async function getJson(url, { method = 'GET', headers = {}, body, timeoutMs = 20000, signal } = {}) {
  const ctrl = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  let res;
  try {
    res = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body), signal: ctrl });
  } catch (e) {
    throw runError(e.name === 'TimeoutError' ? 'timeout' : 'provider_error', `Search request failed: ${e.message}`);
  }
  if (res.status === 429) throw runError('rate_limited', 'Search provider rate limit');
  if (res.status >= 500) throw runError('provider_error', `Search provider error ${res.status}`);
  if (!res.ok) throw runError('config_error', `Search provider rejected the request (${res.status}). Check the API key.`);
  return res.json();
}

export function requireKey(name, key) {
  if (!key) throw runError('config_error', `${name} is selected but its API key is not set in .env`);
}
