/**
 * IV2-6 (inputvaliderings-review 2026-10-18): fornuftstjek af klientens tal i createOfferFromCalculation. Actionen
 * stolede på kalkulationsdialogens beløb (NaN/Infinity, negative mængder/tider, >100 % rabat) — de blev til tilbudslinjer,
 * total og kost. Fuld genberegning på serveren er en senere udvidelse; tilbuddet oprettes som kladde. Ren funktion.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AMOUNT = 1_000_000_000

type Num = number | null | undefined
interface CalcOfferInputShape {
  title?: unknown
  description?: unknown
  customerId?: unknown
  validUntil?: unknown
  termsAndConditions?: unknown
  items?: Array<{
    componentName?: unknown
    variantName?: unknown
    quantity?: Num
    calculatedTimeMinutes?: Num
    costPrice?: Num
    salePrice?: Num
    materials?: Array<{ quantity?: Num; costPrice?: Num; salePrice?: Num }> | null
  }> | null
  result?: { salePriceExclVat?: Num; costPrice?: Num } | null
  settings?: { hourlyRate?: Num; marginPercentage?: Num; discountPercentage?: Num } | null
}

const okNum = (v: Num, { min = 0, max = MAX_AMOUNT, optional = false } = {}) =>
  v == null ? optional : typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const okText = (v: unknown, max: number, required = false) =>
  v == null || v === '' ? !required : typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0)

/** null = gyldigt, ellers dansk fejltekst. */
export function calculationOfferInputError(input: CalcOfferInputShape | null | undefined): string | null {
  if (!input || typeof input !== 'object') return 'Ugyldigt input'
  if (!okText(input.title, 300, true)) return 'Titel mangler eller er for lang (max 300 tegn)'
  if (!okText(input.description, 5_000)) return 'Beskrivelse er for lang'
  if (!okText(input.termsAndConditions, 20_000)) return 'Betingelser er for lange'
  if (!UUID_RE.test(String(input.customerId ?? ''))) return 'Vælg en kunde'
  if (input.validUntil != null && input.validUntil !== '' && !/^\d{4}-\d{2}-\d{2}/.test(String(input.validUntil))) return 'Ugyldig gyldighedsdato'

  const s = input.settings
  if (!s || typeof s !== 'object') return 'Kalkulationsindstillinger mangler'
  if (!okNum(s.hourlyRate, { max: 100_000, optional: true })) return 'Ugyldig timepris'
  if (!okNum(s.marginPercentage, { min: -100, max: 1_000, optional: true })) return 'Ugyldig avance'
  if (!okNum(s.discountPercentage, { max: 100, optional: true })) return 'Rabat skal være 0–100 %'

  const items = input.items
  if (!Array.isArray(items) || items.length === 0) return 'Kalkulationen har ingen linjer'
  if (items.length > 1_000) return 'For mange kalkulationslinjer (max 1.000)'
  for (const [i, it] of items.entries()) {
    const n = i + 1
    if (!it || typeof it !== 'object') return `Linje ${n} er ugyldig`
    if (!okText(it.componentName, 500, true) || !okText(it.variantName, 500)) return `Linje ${n}: navn mangler eller er for langt`
    if (!okNum(it.quantity, { max: 1_000_000 })) return `Linje ${n}: ugyldigt antal`
    if (!okNum(it.calculatedTimeMinutes, { max: 10_000_000, optional: true })) return `Linje ${n}: ugyldig tid`
    if (!okNum(it.salePrice, { min: -MAX_AMOUNT }) || !okNum(it.costPrice, { optional: true })) return `Linje ${n}: ugyldig pris`
    if (it.materials != null) {
      if (!Array.isArray(it.materials) || it.materials.length > 500) return `Linje ${n}: ugyldige materialer`
      for (const m of it.materials) {
        if (!m || !okNum(m.quantity, { max: 1_000_000 }) || !okNum(m.costPrice) || !okNum(m.salePrice, { optional: true })) {
          return `Linje ${n}: ugyldigt materiale (antal/pris)`
        }
      }
    }
  }
  const r = input.result
  if (r != null) {
    if (typeof r !== 'object') return 'Ugyldigt kalkulationsresultat'
    if (!okNum(r.salePriceExclVat, { optional: true }) || !okNum(r.costPrice, { optional: true })) return 'Ugyldigt kalkulationsresultat (beløb)'
  }
  return null
}
