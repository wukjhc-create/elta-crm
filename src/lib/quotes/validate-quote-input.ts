/**
 * IV2-2 (inputvaliderings-review 2026-10-18): serverside-validering af "Den Gyldne Knap"-tilbud (sendQuoteAction).
 * Før stolede actionen på klientens tal og tekster (Infinity/NaN, negative procenter, 10 MB tekst, ukendt skabelon) —
 * de endte i PDF, mail og sent_quotes. Ren funktion (ingen I/O), testet i scripts/quote-input-validation-test.ts.
 */
import type { GenerateQuoteInput } from '@/types/quote-templates.types'

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const QUOTE_LIMITS = {
  maxLines: 500,
  maxQuantity: 1_000_000,
  maxUnitPrice: 100_000_000,
  maxValidityDays: 365,
  title: 300,
  description: 5_000,
  notes: 10_000,
  lineDescription: 2_000,
  shortText: 200,
} as const

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const tooLong = (v: unknown, max: number) => v != null && (typeof v !== 'string' || v.length > max)

/** Returnerer en dansk fejltekst, eller null hvis input er gyldigt. */
export function validateQuoteInput(input: GenerateQuoteInput | null | undefined): string | null {
  if (!input || typeof input !== 'object') return 'Ugyldigt tilbud'
  if (input.templateType !== 'sales' && input.templateType !== 'installation') return 'Ukendt tilbudsskabelon'

  const c = input.customer
  if (!c || typeof c !== 'object') return 'Kundedata mangler'
  const email = typeof c.email === 'string' ? c.email.trim() : ''
  if (!email) return 'Kunde-email er påkrævet'
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Ugyldig kunde-email'
  for (const [k, max] of [['companyName', QUOTE_LIMITS.shortText], ['contactPerson', QUOTE_LIMITS.shortText], ['phone', 50],
    ['address', QUOTE_LIMITS.shortText], ['city', 100], ['postalCode', 20]] as const) {
    if (tooLong(c[k], max)) return `Kundefeltet ${k} er for langt (max ${max} tegn)`
  }
  if (input.customerId != null && !UUID_RE.test(String(input.customerId))) return 'Ugyldigt kunde-id'

  if (typeof input.title !== 'string' || !input.title.trim()) return 'Titel er påkrævet'
  if (input.title.length > QUOTE_LIMITS.title) return `Titel er for lang (max ${QUOTE_LIMITS.title} tegn)`
  if (tooLong(input.description, QUOTE_LIMITS.description)) return `Beskrivelse er for lang (max ${QUOTE_LIMITS.description} tegn)`
  if (tooLong(input.notes, QUOTE_LIMITS.notes)) return `Noter er for lange (max ${QUOTE_LIMITS.notes} tegn)`
  if (typeof input.senderName !== 'string' || !input.senderName.trim()) return 'Afsendernavn er påkrævet'
  if (input.senderName.length > QUOTE_LIMITS.shortText) return 'Afsendernavn er for langt'

  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) return 'Mindst én tilbudslinje er påkrævet'
  if (input.lineItems.length > QUOTE_LIMITS.maxLines) return `For mange tilbudslinjer (max ${QUOTE_LIMITS.maxLines})`
  let subtotal = 0
  for (const [i, li] of input.lineItems.entries()) {
    const n = i + 1
    if (!li || typeof li !== 'object') return `Linje ${n} er ugyldig`
    if (typeof li.description !== 'string' || li.description.length > QUOTE_LIMITS.lineDescription) return `Linje ${n}: beskrivelse mangler eller er for lang`
    if (tooLong(li.unit, 30) || tooLong(li.section, 100)) return `Linje ${n}: enhed/sektion er for lang`
    if (!finite(li.quantity) || Math.abs(li.quantity) > QUOTE_LIMITS.maxQuantity) return `Linje ${n}: ugyldigt antal`
    if (!finite(li.unitPrice) || Math.abs(li.unitPrice) > QUOTE_LIMITS.maxUnitPrice) return `Linje ${n}: ugyldig pris`
    for (const k of ['costPrice', 'listPrice'] as const) {
      if (li[k] != null && (!finite(li[k]) || Math.abs(li[k] as number) > QUOTE_LIMITS.maxUnitPrice)) return `Linje ${n}: ugyldig ${k === 'costPrice' ? 'kostpris' : 'listepris'}`
    }
    if (tooLong(li.supplierSku, 100) || tooLong(li.supplierName, 100)) return `Linje ${n}: leverandørfelt er for langt`
    subtotal += li.quantity * li.unitPrice
  }
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 'Tilbuddets total skal være større end 0'

  if (!Number.isInteger(input.validityDays) || input.validityDays < 1 || input.validityDays > QUOTE_LIMITS.maxValidityDays) {
    return `Gyldighed skal være 1–${QUOTE_LIMITS.maxValidityDays} dage`
  }
  if (!finite(input.taxPercentage) || input.taxPercentage < 0 || input.taxPercentage > 100) return 'Moms skal være 0–100 %'
  if (!finite(input.discountPercentage) || input.discountPercentage < 0 || input.discountPercentage > 100) return 'Rabat skal være 0–100 %'

  if (input.solarData != null) {
    const s = input.solarData
    if (typeof s !== 'object') return 'Ugyldige anlægsdata'
    for (const k of ['systemSizeKwp', 'estimatedAnnualProductionKwh', 'estimatedSavingsPerYear'] as const) {
      const v = s[k]
      if (v != null && (!finite(v) || v < 0 || v > 1e9)) return 'Ugyldige anlægsdata (tal)'
    }
    for (const k of ['panelType', 'inverterType', 'batteryType', 'roofType'] as const) {
      if (tooLong(s[k], QUOTE_LIMITS.shortText)) return 'Anlægsdata: tekstfelt er for langt'
    }
  }
  return null
}
