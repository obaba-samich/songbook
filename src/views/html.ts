/** Small HTML helpers shared by all views. */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Attribute-safe tooltip attribute. */
export function tip(text: string | null): string {
  return text ? ` data-tip="${esc(text)}"` : '';
}
