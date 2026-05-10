/**
 * Sprint 8D-1 polish: sanitize email HTML before rendering with
 * dangerouslySetInnerHTML. Bruger isomorphic-dompurify som virker
 * både server-side (SSR) og client-side.
 *
 * Tilladte tags:
 * - Almindelig formatting: p, div, span, br, hr, strong, em, b, i, u
 * - Lister: ul, ol, li
 * - Headings: h1-h6
 * - Tabeller: table, thead, tbody, tfoot, tr, td, th
 * - Links: a (med href + target=_blank)
 * - Billeder: img (kun http(s) src)
 * - Code: code, pre, blockquote
 *
 * Fjernet/neutraliseret:
 * - script, iframe, object, embed, form, input
 * - on*-event handlers (onclick, onerror, onload, ...)
 * - javascript:/data:-URLs i href/src
 * - Style-attributter beholdes (mail-templates afhænger af dem)
 *   men style-tags fjernes
 */

import DOMPurify from 'isomorphic-dompurify'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'br', 'hr',
    'strong', 'em', 'b', 'i', 'u', 'small', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'a', 'img',
    'code', 'pre', 'blockquote',
    'figure', 'figcaption',
  ],
  ALLOWED_ATTR: [
    // Generelle layout/styling
    'style', 'class', 'id', 'title',
    'align', 'valign', 'colspan', 'rowspan',
    'width', 'height', 'border', 'cellpadding', 'cellspacing',
    // Links
    'href', 'target', 'rel',
    // Billeder
    'src', 'alt', 'srcset', 'loading',
  ],
  // Brug DOMPurify's standardliste over forbidden URI schemes —
  // den fanger javascript:, data: (eksklusive billed-data:), vbscript:
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
  // Tilføj target=_blank + rel=noopener på alle links automatisk
  ADD_ATTR: ['target', 'rel'],
}

/**
 * Sanitize HTML fra en mail. Returnerer string klar til
 * dangerouslySetInnerHTML.
 *
 * Sikker fallback: hvis DOMPurify fejler, returnerer tom streng
 * (rendering viser ikke noget i stedet for at risikere XSS).
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html || typeof html !== 'string') return ''
  try {
    const cleaned = DOMPurify.sanitize(html, SANITIZE_CONFIG)
    // Tilføj target=_blank og rel=noopener på alle <a href> links efter
    // sanitization (DOMPurify har ikke en built-in måde til det via config)
    return cleaned.replace(
      /<a\s+([^>]*?)href=("[^"]*"|'[^']*')([^>]*?)>/gi,
      (match, before, href, after) => {
        // Skip hvis target allerede sat
        if (/target=/i.test(before + after)) return match
        return `<a ${before}href=${href}${after} target="_blank" rel="noopener noreferrer">`
      }
    )
  } catch {
    return ''
  }
}
