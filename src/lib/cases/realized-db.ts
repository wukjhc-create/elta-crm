/**
 * Realiseret DB pr. sag (ren logik, ingen I/O).
 *
 *   netto faktureret (ekskl. moms) = udstedte standardfakturaer − kreditnotaer
 *                                     (kladder og annullerede tæller ikke)
 *   realiseret DB                  = netto faktureret − sagens faktiske kost (tid + materialer + øvrige)
 *
 * Forskel fra "foreløbig DB" (Økonomi-fanens hovedtal): den regner på registrerede SALGSPRISER, også for arbejde der
 * endnu ikke er faktureret. Realiseret DB er det, kunden faktisk er faktureret for, mod det sagen faktisk har kostet.
 */

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
  let invoiced = 0
  let credited = 0
  let issued = 0
  for (const inv of invoices) {
    if (inv.voided_at) continue
    if ((inv.status ?? 'draft') === 'draft') continue
    const amount = Math.abs(Number(inv.total_amount ?? 0) || 0)
    if (inv.invoice_type === 'credit') credited += amount
    else invoiced += amount
    issued += 1
  }
  const net = r2(invoiced - credited)
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
