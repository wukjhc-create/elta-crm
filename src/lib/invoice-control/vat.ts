/**
 * CVR/VAT-normalisering — SAMME regel som DB-funktionen public.normalize_vat_number (migration 00167), saa
 * parserens udtrukne CVR og leverandoerens gemte CVR altid sammenlignes i samme form. Bevidst IKKE 'use server'.
 *
 *   "12 34 56 78" | "12345678" | "DK-12345678" | "dk12.34.56.78" | "4512345678" -> "DK12345678"
 *   Udenlandske (fx "SE556677889901") -> store bogstaver uden mellemrum/punktum/bindestreg.
 *   Tom/whitespace -> null.
 */
export function normalizeVatNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).replace(/[\s.\-/]/g, '').toUpperCase()
  if (s === '') return null
  if (/^\d{8}$/.test(s)) return `DK${s}`
  if (/^45\d{8}$/.test(s)) return `DK${s.slice(2)}`
  return s
}

/** Samme format som DB-CHECK'en i 00167. */
export function isValidVatFormat(v: string | null): boolean {
  return v === null || /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(v)
}
