import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { pdfToText } from '../src/providers/fetch/pdf.js';
import { createFetcher, userAgent } from '../src/providers/fetch/fetcher.js';
import { excerpt } from '../src/stages/prompts.js';
import { passageFound } from '../src/scoring/status.js';
import { makePdf } from './fixtures/make-pdf.js';

const REPORT = makePdf([
  ['Varun Beverages Limited Annual Report 2025', 'Letter to shareholders from the chairman and board.'],
  ['Sales volume in India grew 9.1% to 1,090 million cases in CY2025.', 'Carbonated soft drinks were 71% of volume.'],
]);

test('a text PDF becomes page-marked text that exact quotes match', async () => {
  const { text, pages } = await pdfToText(REPORT);
  assert.equal(pages, 2);
  assert.match(text, /^\[page 1\]\n/);
  assert.match(text, /\[page 2\]\nSales volume in India grew 9\.1%/);
  assert.equal(passageFound('Sales volume in India grew 9.1% to 1,090 million cases in CY2025.', text), true);
});

test('a PDF with no text layer is refused visibly, not guessed at', async () => {
  await assert.rejects(pdfToText(makePdf([[]])), (e) => e.code === 'fetch_blocked' && /no text layer/.test(e.message));
  await assert.rejects(pdfToText(Buffer.from('not a pdf')), (e) => e.code === 'fetch_blocked');
});

test('the fetcher reads PDFs and names a contact in its user agent', async (t) => {
  let seenUA;
  const server = http.createServer((req, res) => {
    seenUA = req.headers['user-agent'];
    if (req.url === '/robots.txt') return res.end('User-agent: *\nDisallow:\n');
    res.writeHead(200, { 'content-type': req.url.endsWith('.pdf') ? 'application/octet-stream' : 'application/pdf' });
    res.end(REPORT);
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetcher = createFetcher({ contact: 'research@example.com' });
  for (const p of ['/annual-report', '/annual-report.pdf']) {
    const page = await fetcher.fetch(base + p);
    assert.equal(page.contentType, 'application/pdf');
    assert.equal(page.pages, 2);
    assert.match(page.text, /1,090 million cases/);
  }
  assert.equal(seenUA, userAgent('research@example.com'));
  assert.match(seenUA, /research@example\.com\)$/);
});

test('long documents keep the passages about the study, in order, with their page', () => {
  const filler = (n) => `Boilerplate governance text about board committees. `.repeat(n);
  const doc = `[page 1]\n${filler(60)}\n[page 7]\n${filler(10)}PepsiCo India beverage volume grew 9% in 2025.${filler(10)}\n[page 9]\n${filler(60)}`;
  const out = excerpt(doc, ['How is PepsiCo doing in beverages?'], 2000);
  assert.ok(out.length <= 2400);
  assert.match(out, /PepsiCo India beverage volume grew 9% in 2025/);
  assert.match(out, /\[page 7/);
  assert.equal(excerpt('short text', ['x'], 2000), 'short text');
});
