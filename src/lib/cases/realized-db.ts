/**
 * Realiseret DB pr. sag (ren logik, ingen I/O).
 *
 *   netto faktureret (ekskl. moms) = udstedte (sendt/betalt) fakturaer − kreditnotaer — via summarizeCaseInvoices
 *                                     (kladder tæller ikke; en fuldt krediteret original tæller med og udlignes af
 *                                     sin kreditnota; negativ slutfaktura beholder fortegn — X1 2026-10-07)
 *   realiseret DB                  = netto faktureret − sagens faktiske kost (tid + materialer + øvrige)
 *
 * Forskel fra "foreløbig DB" (Økonomi-fanens hovedtal): den regner på registrerede SALGSPRISER, også for arbejde der
 * endnu ikke er faktureret. Realiseret DB er det, kunden faktisk er faktureret for, mod det sagen faktisk har kostet.
 */

import { summarizeCaseInvoices } from '@/lib/invoices/net-invoiced'

export interface RealizedInvoiceInput {
  total_amount: number | string | null
  status: string | null
  invoice_type: string | null
  voided_at: string | null
}

export interface RealizedDb {
  /** Udstedte (ikke kladde/annullerede) standardfakturaer ekskl. moms */
  invoiced_ex_vat: number
  /** Kreditnotaer ekskl. moms (positivt tal) */
  credited_ex_vat: number
  net_invoiced_ex_vat: number
  actual_cost: number
  realized_db: number
  /** null når intet er faktureret (procent giver ikke mening) */
  realized_db_pct: number | null
  issued_invoice_count: number
  state: 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced'
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeRealizedDb(
  invoices: RealizedInvoiceInput[],
  actualCost: number,
  fullyBilled: boolean,
): RealizedDb {
  const sum = summarizeCaseInvoices(invoices)
  const invoiced = sum.invoicedExVat
  const credited = sum.creditedExVat
  const issued = sum.issuedCount
  const net = sum.netExVat
  const cost = r2(actualCost)
  const db = r2(net - cost)
  return {
    invoiced_ex_vat: r2(invoiced),
    credited_ex_vat: r2(credited),
    net_invoiced_ex_vat: net,
    actual_cost: cost,
    realized_db: db,
    realized_db_pct: net > 0 ? r2((db / net) * 100) : null,
    issued_invoice_count: issued,
    state: issued === 0 ? 'not_invoiced' : fullyBilled ? 'fully_invoiced' : 'partially_invoiced',
  }
}
