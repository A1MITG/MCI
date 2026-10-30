// PDF text extraction (annual reports, filings, government PDFs). Text-layer PDFs only:
// scanned image PDFs have no text and are refused visibly rather than guessed at (OCR is not built).
import { getDocumentProxy, extractText } from 'unpdf';
import { runError } from '../../core/errors.js';

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 400;

/** bytes -> {text, pages}. Each page starts with a "[page N]" marker so quotes can be cited by page. */
export async function pdfToText(bytes, { url = '', maxPages = MAX_PDF_PAGES } = {}) {
  if (bytes.byteLength > MAX_PDF_BYTES) throw runError('fetch_blocked', `PDF larger than ${MAX_PDF_BYTES / 1024 / 1024} MB: ${url}`);
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    throw runError('fetch_blocked', `Could not open PDF ${url}: ${e.message}`);
  }
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text.slice(0, maxPages);
    const body = pages.map((t, i) => `[page ${i + 1}]\n${String(t).replace(/[ \t]+/g, ' ').trim()}`).join('\n');
    const chars = pages.join('').replace(/\s+/g, '').length;
    if (chars < 40 * Math.min(pages.length, 5)) throw runError('fetch_blocked', `PDF has no text layer (scanned image; OCR not built): ${url}`);
    const note = totalPages > pages.length ? `\n[pages ${pages.length + 1}-${totalPages} not read: page limit ${maxPages}]` : '';
    return { text: body + note, pages: totalPages };
  } finally {
    await pdf.destroy?.();
  }
}
