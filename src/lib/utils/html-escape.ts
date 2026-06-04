/**
 * Central HTML-escape helper for konstruktion af HTML-strings i email-
 * templates og inline mail-bodies. Alle 5 entities haandteres saa output
 * er sikkert i baade element-text- og attribut-context.
 *
 * Bruges NAAR vi bygger HTML (escape user-input foer indsaettelse).
 * Til rendering af FREMMED HTML (fx indkommende mails) brug
 * src/lib/utils/sanitize-email-html.ts — den bruger DOMPurify-whitelist
 * og er en helt anden use-case.
 */

/**
 * Escape user-input til HTML-context.
 *
 * - null/undefined → tom streng
 * - non-string input → String(input)
 * - escapes 5 entities: & < > " '
 *
 * Sikker i baade `<p>{val}</p>` og `<a title="{val}">` og `<a title='{val}'>`.
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Som escapeHtml, men konverterer linjeskift (\n) til <br/> bagefter.
 * Bruges naar fri-tekst skal vises i HTML-mail og linjeskift skal bevares.
 */
export function escapeHtmlWithLineBreaks(input: unknown): string {
  return escapeHtml(input).replace(/\n/g, '<br/>')
}
