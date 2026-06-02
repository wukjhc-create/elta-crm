/**
 * Sprint 9I — defensive guards mod raw JSON-leak i customer_documents.description.
 *
 * description-feltet bruges som data-store af flere flows:
 *   - besigtigelse:        { formData: {...}, imageUrls: [...] }
 *     (inkl. signatureData base64, signed storage URLs, WiFi-password, etc.)
 *   - fuldmagt:            { type: 'fuldmagt', status, signed_at, ... }
 *   - email_attachment:    { type: 'email_attachment', ... }
 *
 * Det maa ALDRIG renderes raw til UI — hverken intern medarbejderside eller
 * kundeportal. Disse helpers er det centrale gate-point.
 */

export function isLikelyJsonDescription(description: string | null | undefined): boolean {
  if (!description) return false
  const trimmed = description.trim()
  if (!trimmed) return false
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

/**
 * Returner kun en tekst-beskrivelse hvis den er sikker at vise.
 *  - null hvis besigtigelse (description er altid JSON-payload)
 *  - null hvis tom
 *  - null hvis JSON-form
 *  - ellers den ren tekst
 */
export function getSafeDocumentDescription(doc: {
  description: string | null | undefined
  document_type?: string | null
}): string | null {
  if (doc.document_type === 'besigtigelse') return null
  if (!doc.description) return null
  if (isLikelyJsonDescription(doc.description)) return null
  return doc.description
}
