/**
 * Netto faktureret på en sag (ren logik). Bevidst IKKE 'use server'.
 *
 * Sags-review 2026-10-05 (Q16): "Faktureret"/"Rest at fakturere" summerede ALLE fakturaer — kladder, annullerede og
 * kreditnotaer som plus (60k + kredit 60k + 40k viste 160k). Kun udstedte (sendt/betalt) fakturaer tæller;
 * kreditnotaer trækkes fra uanset hvilket fortegn de er gemt med.
 *
 * Økonomi-review 2026-10-07 (X1):
 *  - En FULDT krediteret original får voided_at (recomputeOriginalVoidStatus — eneste sted det sættes) — den blev
 *    sprunget over, MENS dens kreditnota stadig blev trukket fra → dobbelt fradrag (60k + kredit 60k + 40k = −20k).
 *    Netting tæller derfor ALLE udstedte fakturaer inkl. annullerede originaler; kreditnotaen udligner dem.
 *  - En negativ slutfaktura (forudbetalinger > faktiske linjer) beholder sit fortegn (før Math.abs → talt som plus).
 *  - "Betalt": en manuelt markeret betalt faktura har amount_paid = 0 — status 'paid' tæller som fuldt betalt.
 * Alle steder der viser faktureret/rest/udestående på en sag skal bruge summarizeCaseInvoices.
 */
export type InvoiceAmountRow = {
  total_amount: number | string | null
  status: string | null
  invoice_type: string | null
  voided_at: string | null
}

export type CaseInvoiceRow = InvoiceAmountRow & {
  final_amount?: number | string | null
  amount_paid?: number | string | null
}

export const ISSUED_INVOICE_STATUSES: ReadonlySet<string> = new Set(['sent', 'paid'])

/** Udstedt OG ikke annulleret — til lister over aktive fakturaer (IKKE til netting, se summarizeCaseInvoices). */
export function isIssuedActiveInvoice(r: Pick<InvoiceAmountRow, 'status' | 'voided_at'>): boolean {
  return !r.voided_at && ISSUED_INVOICE_STATUSES.has(r.status ?? '')
}

export type CaseInvoiceSummary = {
  invoicedExVat: number
  creditedExVat: number
  netExVat: number
  invoicedInclVat: number
  creditedInclVat: number
  netInclVat: number
  /** Betalt på ikke-kredit-fakturaer (inkl. moms); status 'paid' uden registreret beløb = fuldt betalt */
  paidInclVat: number
  /** max(0, netto inkl. moms − betalt) */
  outstandingInclVat: number
  issuedCount: number
  voidedCount: number
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function summarizeCaseInvoices(rows: CaseInvoiceRow[]): CaseInvoiceSummary {
  let invEx = 0, credEx = 0, invIncl = 0, credIncl = 0, paid = 0, issued = 0, voided = 0
  for (const r of rows) {
    if (!ISSUED_INVOICE_STATUSES.has(r.status ?? '')) continue // kladder tæller aldrig
    issued++
    if (r.voided_at) voided++
    const ex = num(r.total_amount)
    const incl = num(r.final_amount ?? r.total_amount)
    if (r.invoice_type === 'credit') {
      credEx += Math.abs(ex)
      credIncl += Math.abs(incl)
    } else {
      invEx += ex // fortegnet bevares (negativ slutfaktura trækker fra)
      invIncl += incl
      const p = num(r.amount_paid)
      paid += r.status === 'paid' && p <= 0 ? Math.max(incl, 0) : p
    }
  }
  const netIncl = invIncl - credIncl
  return {
    invoicedExVat: r2(invEx),
    creditedExVat: r2(credEx),
    netExVat: r2(invEx - credEx),
    invoicedInclVat: r2(invIncl),
    creditedInclVat: r2(credIncl),
    netInclVat: r2(netIncl),
    paidInclVat: r2(paid),
    outstandingInclVat: r2(Math.max(0, netIncl - paid)),
    issuedCount: issued,
    voidedCount: voided,
  }
}

/** Netto udstedt ekskl. moms (sendte/betalte fakturaer minus udstedte kreditnotaer). */
export function netInvoicedExVat(rows: InvoiceAmountRow[]): number {
  return summarizeCaseInvoices(rows).netExVat
}
