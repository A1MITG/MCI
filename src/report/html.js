// HTML helpers. All text in a report is escaped; claim references become buttons.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Escape text, then turn [C01] or [C01, I02] into claim pills. */
export function withPills(text) {
  return esc(text).replace(/\[((?:[CIEVR]\d{2,})(?:\s*[,;]\s*[CIEVR]\d{2,})*)\]/g, (_, list) =>
    list.split(/[,;]/).map((id) => pill(id.trim())).join(''),
  );
}

export function pill(id) {
  return `<button type="button" class="pill claim-link" data-claim="${esc(id)}">${esc(id)}</button>`;
}

/** JSON for a <script type="application/json"> block, safe against </script> injection. */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
