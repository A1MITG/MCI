// Page fetcher: robots.txt check, timeout, HTML-to-text. Every page it returns is untrusted data.
import { runError } from '../../core/errors.js';
import { pdfToText, MAX_PDF_BYTES } from './pdf.js';

const UA = 'VantagePointResearch/0.1 (+research use; respects robots.txt)';
// SEC EDGAR refuses requests that do not name a contact, so FETCH_CONTACT_EMAIL in .env is added to the user agent.
export const userAgent = (contact) => (contact ? `${UA.slice(0, -1)}; ${contact})` : UA);

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', euro: '€', pound: '£', rupee: '₹', copy: '©', reg: '®', trade: '™' };
const codePoint = (n, fallback) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : fallback);

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&') // first, so double-encoded entities like &amp;#x27; decode fully below
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(Number(d), m))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Minimal robots.txt check for user-agent "*". Unreadable robots.txt means allowed. */
export function robotsAllows(robotsTxt, pathname) {
  let applies = false;
  const disallow = [];
  for (const raw of robotsTxt.split('\n')) {
    const line = raw.split('#')[0].trim();
    const [k, ...rest] = line.split(':');
    const v = rest.join(':').trim();
    if (/^user-agent$/i.test(k)) applies = v === '*';
    else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
  }
  return !disallow.some((p) => pathname.startsWith(p));
}

export function createFetcher({ timeoutMs = 60000, contact = '' } = {}) {
  const ua = userAgent(contact);
  const robotsCache = new Map();
  async function get(url, signal) {
    const s = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    return fetch(url, { headers: { 'user-agent': ua }, redirect: 'follow', signal: s });
  }
  return {
    async fetch(url, { signal } = {}) {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw runError('fetch_blocked', `Unsupported protocol ${u.protocol}`);
      if (!robotsCache.has(u.origin)) {
        const txt = await get(`${u.origin}/robots.txt`, signal).then((r) => (r.ok ? r.text() : ''), () => '');
        robotsCache.set(u.origin, txt);
      }
      if (!robotsAllows(robotsCache.get(u.origin), u.pathname)) throw runError('fetch_blocked', `robots.txt disallows ${url}`);
      let res;
      try {
        res = await get(url, signal);
      } catch (e) {
        throw runError(e.name === 'TimeoutError' ? 'timeout' : 'provider_error', `Fetch failed for ${url}: ${e.message}`);
      }
      if (res.status === 403 && /(^|\.)sec\.gov$/.test(u.hostname) && !contact) throw runError('fetch_blocked', `SEC EDGAR needs a contact: set FETCH_CONTACT_EMAIL in .env (${url})`);
      if (res.status === 401 || res.status === 402 || res.status === 403) throw runError('fetch_blocked', `Access denied (${res.status}) for ${url}; not bypassed`);
      if (res.status === 429) throw runError('rate_limited', `Rate limited by ${u.host}`);
      if (!res.ok) throw runError('fetch_blocked', `HTTP ${res.status} for ${url}`);
      const type = res.headers.get('content-type') || '';
      if (type.includes('pdf') || (/\.pdf$/i.test(u.pathname) && /octet-stream|^$/.test(type))) {
        if (Number(res.headers.get('content-length')) > MAX_PDF_BYTES) throw runError('fetch_blocked', `PDF larger than ${MAX_PDF_BYTES / 1024 / 1024} MB: ${url}`);
        const { text, pages } = await pdfToText(await res.arrayBuffer(), { url });
        return { url: res.url || url, status: res.status, contentType: 'application/pdf', pages, text, fetchedAt: new Date().toISOString() };
      }
      const body = await res.text();
      return { url: res.url || url, status: res.status, contentType: type, text: type.includes('html') ? htmlToText(body) : body, fetchedAt: new Date().toISOString() };
    },
  };
}

/** Offline fetcher for tests and evals: pages come from a map {url -> text}. */
export function fixtureFetcher(pages = {}) {
  return {
    async fetch(url) {
      if (!(url in pages)) throw runError('fetch_blocked', `No fixture page for ${url}`);
      return { url, status: 200, contentType: 'text/plain', text: pages[url], fetchedAt: '2026-10-25T00:00:00.000Z' };
    },
  };
}
