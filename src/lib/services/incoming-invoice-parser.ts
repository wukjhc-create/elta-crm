/**
 * Supplier invoice parser (Phase 15).
 *
 * Pure heuristic — no LLM dependency. Designed for Danish invoices
 * (AO, Lemvigh-Müller, Solar, etc.) and falls back gracefully when
 * a field can't be extracted.
 *
 * Inputs: raw text (PDF text-extracted upstream OR email body).
 * Output: ParsedInvoiceFields with a 0–1 confidence score.
 *
 * The parser does NOT call the database. It's a pure function so it
 * can be unit-tested and re-run on the same text deterministically.
 */
import type { ParsedInvoiceFields } from '@/types/incoming-invoices.types'

export function parseSupplierInvoiceText(rawText: string): ParsedInvoiceFields {
  const text = (rawText || '').replace(/ /g, ' ')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const out: ParsedInvoiceFields = {
    supplierName: null,
    supplierVatNumber: null,
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    amountExclVat: null,
    vatAmount: null,
    amountInclVat: null,
    paymentReference: null,
    iban: null,
    currency: 'DKK',
    workOrderHints: [],
    supplierOrderRefs: [],
    deliveryAddressHints: [],
    confidence: 0,
    fieldScores: {},
  }

  // ---- Supplier VAT ---- (CVR / DK + 8 digits)
  const vatMatch = text.match(/\b(?:CVR|VAT|SE)[\s.:#-]*((?:DK)?\s*\d[\d\s]{6,9}\d)\b/i)
  if (vatMatch) out.supplierVatNumber = normalizeVat(vatMatch[1])

  // ---- Supplier name ---- best-effort: top of doc, before "Faktura"
  out.supplierName = guessSupplierName(lines)

  // ---- Invoice number ----
  const invMatch =
    text.match(/Faktura(?:nr|nummer|\s*nr|\s*nummer)[\s.:#-]*([A-Z0-9-]{3,20})/i) ||
    text.match(/Invoice\s*(?:no|number|#)[\s.:#-]*([A-Z0-9-]{3,20})/i)
  if (invMatch) out.invoiceNumber = invMatch[1].trim()

  // ---- Invoice date ----
  const invDate =
    findDateNear(text, /(?:Faktura|Invoice)\s*dato/i) ||
    findDateNear(text, /Bilags?\s*dato/i)
  if (invDate) out.invoiceDate = invDate

  // ---- Due date ----
  const dueDate =
    findDateNear(text, /Forfald(?:s)?(?:dato)?/i) ||
    findDateNear(text, /Betal(?:es|ings)?\s*senest/i) ||
    findDateNear(text, /Due\s*date/i)
  if (dueDate) out.dueDate = dueDate

  // ---- Amounts ----
  // Total incl. VAT — look for "Total / I alt / Beløb i alt" near "DKK"
  out.amountInclVat =
    findAmountNear(text, /(?:I\s*alt|Total(?:\s*incl)?|Beløb\s*i\s*alt|Total\s*to\s*pay)/i) ??
    findAmountNear(text, /At\s*betale/i)
  out.amountExclVat =
    findAmountNear(text, /(?:Subtotal|Sum\s*(?:excl|ex)\s*moms|Beløb\s*ekskl(?:\.\s*moms)?)/i) ??
    findAmountNear(text, /Net\s*total/i)
  out.vatAmount =
    findAmountNear(text, /(?:Moms|VAT|Tax)\s*(?:beløb)?/i)

  // If we have only incl + vat, derive excl.
  if (out.amountInclVat != null && out.vatAmount != null && out.amountExclVat == null) {
    out.amountExclVat = round2(out.amountInclVat - out.vatAmount)
  }
  // Or the other way around.
  if (out.amountInclVat == null && out.amountExclVat != null && out.vatAmount != null) {
    out.amountInclVat = round2(out.amountExclVat + out.vatAmount)
  }

  // ---- Payment reference ----
  // Danish FIK +71/+73/+75 + 15-digit ref
  const fik = text.match(/\+\s*(7[135])\s*<?\s*([\d\s]{12,18})/)
  if (fik) out.paymentReference = `+${fik[1]}<${fik[2].replace(/\s/g, '')}>`
  // EAN/GLN 13-digit number labelled "EAN"
  const ean = text.match(/\bEAN[\s.:#-]*(\d{13})\b/i)
  if (ean && !out.paymentReference) out.paymentReference = ean[1]
  // OCR/giro line fallback
  if (!out.paymentReference) {
    const gen = text.match(/Betalings?reference[\s.:#-]*([A-Z0-9 \-+<>]{6,40})/i)
    if (gen) out.paymentReference = gen[1].trim()
  }

  // ---- IBAN ----
  const iban = text.match(/\b(DK\d{2}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{2})\b/i)
  if (iban) out.iban = iban[1].replace(/[\s-]/g, '').toUpperCase()

  // ---- Currency ----
  if (/\bEUR\b/.test(text)) out.currency = 'EUR'
  else if (/\bUSD\b/.test(text)) out.currency = 'USD'
  else out.currency = 'DKK'

  // ---- Work order / case hints (Elta-side refs: "Sag:", "Vores ref") ----
  const hintRe = /(?:Sag(?:s?nr)?|Reference|Vores\s*ref|Jeres\s*ref)[\s.:#-]*([A-Z0-9][A-Z0-9\-_/]{2,20})/gi
  const hints = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = hintRe.exec(text))) hints.add(m[1].trim())
  out.workOrderHints = Array.from(hints)

  // ---- Supplier-side order references (AO-ordrer, LM ordre nr) ----
  const orderRefs = new Set<string>()
  const supplierRefPatterns: RegExp[] = [
    /(?:AO|Ahlsell)[\s\-#:]*ordre[\s.:#-]*([A-Z0-9\-]{4,20})/gi,
    /Ordrenr(?:\.|ummer)?[\s.:#-]*([A-Z0-9\-]{4,20})/gi,
    /Order\s*(?:no|number|ref|reference)[\s.:#-]*([A-Z0-9\-]{4,20})/gi,
    /Pakkeseddel[\s.:#-]*([A-Z0-9\-]{4,20})/gi,
    /Følgeseddel[\s.:#-]*([A-Z0-9\-]{4,20})/gi,
    /(?:Lemvigh-Müller|LM)\s*ordre[\s.:#-]*([A-Z0-9\-]{4,20})/gi,
  ]
  for (const re of supplierRefPatterns) {
    let mm: RegExpExecArray | null
    while ((mm = re.exec(text))) orderRefs.add(mm[1].trim())
  }
  out.supplierOrderRefs = Array.from(orderRefs)

  // ---- Customer / delivery address hints ----
  // Pull lines that look like Danish addresses (street + number + zip + city).
  // We use this for the customer-address fallback in the matcher.
  const addressHints = new Set<string>()
  const addressLineRe = /(.{4,80}?\s\d{1,4}[A-Z]?(?:,\s*[\dA-Za-z\s]{1,20})?,?\s+\d{4}\s+[A-ZÆØÅa-zæøå][A-ZÆØÅa-zæøå\s\-]{2,40})/g
  let am: RegExpExecArray | null
  while ((am = addressLineRe.exec(text))) {
    const candidate = am[1].replace(/\s+/g, ' ').trim()
    if (candidate.length <= 100) addressHints.add(candidate)
  }
  // Also explicit "Leveringsadresse:" / "Delivery address:" labels.
  const labelledAddrRe = /(?:Leveringsadresse|Delivery\s*address|Leveres\s*til|Sendt\s*til)[\s:.\-]*((?:.+?\n){0,3}.{4,80}\s+\d{4}\s+[A-ZÆØÅa-zæøå][^\n]{2,40})/gi
  let lm: RegExpExecArray | null
  while ((lm = labelledAddrRe.exec(text))) {
    const candidate = lm[1].replace(/\s+/g, ' ').trim()
    if (candidate.length <= 200) addressHints.add(candidate)
  }
  out.deliveryAddressHints = Array.from(addressHints).slice(0, 5)

  // ---- Per-field scores (for matcher's breakdown) ----
  out.fieldScores = {
    supplierName: out.supplierName ? 1 : 0,
    supplierVatNumber: out.supplierVatNumber ? 1 : 0,
    invoiceNumber: out.invoiceNumber ? 1 : 0,
    invoiceDate: out.invoiceDate ? 1 : 0,
    dueDate: out.dueDate ? 1 : 0,
    amountInclVat: out.amountInclVat != null ? 1 : 0,
    paymentReference: out.paymentReference ? 1 : 0,
    iban: out.iban ? 1 : 0,
    workOrderHints: out.workOrderHints.length > 0 ? 1 : 0,
    supplierOrderRefs: out.supplierOrderRefs.length > 0 ? 1 : 0,
    deliveryAddressHints: out.deliveryAddressHints.length > 0 ? 1 : 0,
  }

  // ---- Confidence: count critical fields present ----
  const checks = [
    out.invoiceNumber != null,
    out.invoiceDate != null,
    out.amountInclVat != null,
    out.supplierName != null,
    out.paymentReference != null || out.iban != null,
  ]
  out.confidence = round3(checks.filter(Boolean).length / checks.length)

  return out
}

// =====================================================
// helpers
// =====================================================

function normalizeVat(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) return `DK${digits}`
  if (digits.length === 10 && digits.startsWith('45')) return `DK${digits.slice(2)}`
  return raw.replace(/\s/g, '').toUpperCase()
}

function guessSupplierName(lines: string[]): string | null {
  // Skip generic "Faktura" header lines; pick the first plausible
  // company-name line in the top 8 lines.
  for (const line of lines.slice(0, 8)) {
    const cleaned = line.replace(/\s+/g, ' ').trim()
    if (cleaned.length < 3 || cleaned.length > 80) continue
    if (/^(faktura|invoice|kvittering|bilag)\b/i.test(cleaned)) continue
    if (/^\d/.test(cleaned)) continue
    if (/(aps|a\/s|ivs|holding|gmbh|ltd|inc)\b/i.test(cleaned) || /[A-Za-zÆØÅæøå]/.test(cleaned)) {
      return cleaned
    }
  }
  return null
}

function findDateNear(text: string, labelRe: RegExp): string | null {
  const re = new RegExp(
    labelRe.source +
      '[\\s.:#-]*(' +
      '\\d{4}-\\d{2}-\\d{2}' +              // ISO
      '|' +
      '\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}' + // Danish dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy
      ')',
    labelRe.flags.includes('i') ? 'i' : ''
  )
  const m = text.match(re)
  if (!m) return null
  return normalizeDate(m[1])
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (m) {
    const [, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function findAmountNear(text: string, labelRe: RegExp): number | null {
  // Look for label followed (within 60 chars) by a Danish-format number
  // optionally suffixed with "kr" / "DKK".
  const re = new RegExp(
    labelRe.source +
      '[\\s\\S]{0,60}?([0-9](?:[0-9.\\s]*)[,.]\\d{2})\\s*(?:kr|DKK|EUR)?',
    'i'
  )
  const m = text.match(re)
  if (!m) return null
  return parseDanishNumber(m[1])
}

function parseDanishNumber(s: string): number | null {
  const cleaned = s.replace(/\s/g, '')
  // Danish: 1.234,56 → 1234.56
  if (/,\d{2}$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
  }
  // English: 1,234.56 → 1234.56
  if (/\.\d{2}$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/,/g, ''))
  }
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }
