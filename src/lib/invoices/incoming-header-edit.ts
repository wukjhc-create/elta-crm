/**
 * L-7 (leverandørfaktura-review 2026-10-14): manuel rettelse af en leverandørfakturas hoved
 * (nr., datoer, valuta, beløb). Ren validering — ingen DB. Bruges af editIncomingInvoiceHeaderAction.
 *
 * Regler:
 *  - kun de felter der sendes med ændres; `null` rydder et beløb/en dato (fakturanummer kan ikke ryddes)
 *  - datoer er kalenderdatoer (YYYY-MM-DD), forfald kan ikke ligge før fakturadato
 *  - valuta er en ISO-kode med tre bogstaver
 *  - beløb afrundes til øre; ekskl. + moms = inkl. (±5 øre) og moms ≤ 25 % af ekskl. (+1 kr) — samme regel som parseren
 *  - mangler inkl. men ekskl. og moms kendes, beregnes inkl.
 */

export interface InvoiceHeaderValues {
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  currency: string
  amount_excl_vat: number | null
  vat_amount: number | null
  amount_incl_vat: number | null
}

export type InvoiceHeaderInput = Partial<InvoiceHeaderValues>

export type HeaderEditResult =
  | { ok: true; patch: Partial<InvoiceHeaderValues>; next: InvoiceHeaderValues; changed: Array<keyof InvoiceHeaderValues> }
  | { ok: false; message: string }

const AMOUNT_FIELDS = ['amount_excl_vat', 'vat_amount', 'amount_incl_vat'] as const
const MAX_ABS_AMOUNT = 1e9

const round2 = (n: number) => Math.round(n * 100) / 100

function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function validateInvoiceHeaderEdit(current: InvoiceHeaderValues, input: InvoiceHeaderInput): HeaderEditResult {
  const next: InvoiceHeaderValues = { ...current }

  if (input.invoice_number !== undefined) {
    const v = (input.invoice_number ?? '').trim()
    if (!v) return { ok: false, message: 'Fakturanummer må ikke være tomt' }
    if (v.length > 64) return { ok: false, message: 'Fakturanummer er for langt (højst 64 tegn)' }
    next.invoice_number = v
  }

  for (const f of ['invoice_date', 'due_date'] as const) {
    if (input[f] === undefined) continue
    const v = input[f] ? String(input[f]).trim() : ''
    if (v && !isCalendarDate(v)) return { ok: false, message: `Ugyldig dato: ${v}` }
    next[f] = v || null
  }
  if (next.invoice_date && next.due_date && next.due_date < next.invoice_date) {
    return { ok: false, message: 'Forfaldsdato ligger før fakturadato' }
  }

  if (input.currency !== undefined) {
    const v = (input.currency ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(v)) return { ok: false, message: 'Valuta skal være en kode på tre bogstaver (fx DKK)' }
    next.currency = v
  }

  for (const f of AMOUNT_FIELDS) {
    if (input[f] === undefined) continue
    const v = input[f]
    if (v === null) { next[f] = null; continue }
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_ABS_AMOUNT) {
      return { ok: false, message: 'Ugyldigt beløb' }
    }
    next[f] = round2(v)
  }

  if (next.amount_incl_vat == null && next.amount_excl_vat != null && next.vat_amount != null) {
    next.amount_incl_vat = round2(next.amount_excl_vat + next.vat_amount)
  }
  const { amount_excl_vat: excl, vat_amount: vat, amount_incl_vat: incl } = next
  if (excl != null && vat != null && incl != null) {
    if (Math.abs(excl + vat - incl) > 0.05) {
      return { ok: false, message: `Beløbene stemmer ikke: ekskl. ${excl.toFixed(2)} + moms ${vat.toFixed(2)} ≠ inkl. ${incl.toFixed(2)}` }
    }
    // IV-15 (leverandørfaktura-review 2026-10-18): samme fortegn på alle tre (faktura positiv, kreditnota negativ) — før
    // blev fx ekskl. −1000 / moms +250 / inkl. −750 accepteret
    const signs = [excl, vat, incl].filter((x) => x !== 0).map(Math.sign)
    if (new Set(signs).size > 1) {
      return { ok: false, message: 'Beløbene skal have samme fortegn (negative på en kreditnota)' }
    }
    if (Math.abs(vat) > Math.abs(excl) * 0.25 + 1) {
      return { ok: false, message: 'Momsen er over 25 % af beløbet ekskl. moms' }
    }
  }

  const changed = (Object.keys(next) as Array<keyof InvoiceHeaderValues>).filter((k) => next[k] !== current[k])
  const patch: Partial<InvoiceHeaderValues> = {}
  for (const k of changed) (patch as Record<string, unknown>)[k] = next[k]
  return { ok: true, patch, next, changed }
}
