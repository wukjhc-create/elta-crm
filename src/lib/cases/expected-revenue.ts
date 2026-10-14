/**
 * PE-6 (Profit Engine-review 2026-10-14): omsætningsgrundlag for sagens foreløbige DB (Økonomi-fanens hovedtal).
 * Ren logik, ingen I/O.
 *
 *   kontraktsag (revised_sum ?? contract_sum sat, ekskl. moms) → omsætning = kontraktsummen; er der allerede
 *     faktureret mere (ekstraarbejde), bruges netto faktureret ekskl. moms
 *   regningsarbejde (ingen kontraktsum)                       → omsætning = registrerede salgspriser (uændret)
 *
 * Før talte kontraktsager registrerede salgspriser — timer/materialer prissat til listepris gav en DB, der ikke havde
 * noget med den aftalte pris at gøre.
 */

export type RevenueBasis = 'contract' | 'invoiced' | 'registered'

export interface ExpectedRevenue {
  revenue: number
  basis: RevenueBasis
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function expectedCaseRevenue(input: {
  contractSum: number | string | null | undefined
  revisedSum: number | string | null | undefined
  registeredSale: number
  netInvoicedExVat: number
}): ExpectedRevenue {
  const ref = num(input.revisedSum) ?? num(input.contractSum)
  if (ref == null) return { revenue: r2(input.registeredSale), basis: 'registered' }
  if (input.netInvoicedExVat > ref) return { revenue: r2(input.netInvoicedExVat), basis: 'invoiced' }
  return { revenue: r2(ref), basis: 'contract' }
}
