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

/**
 * F-4 (review 2026-10-16): effektiv kontraktsum med afregningsformen (00232). Regningsarbejde har ingen kontraktsum at
 * regne mod (selv om sager fra tilbud altid får en). Et revideret beløb på 0 tæller ikke over kontraktsummen (samme
 * regel som slutfakturaen: kun beløb > 0). null = intet kontraktgrundlag.
 */
export function effectiveContractSum(input: {
  contractSum: number | string | null | undefined
  revisedSum: number | string | null | undefined
  billingModel?: string | null
}): number | null {
  if (input.billingModel === 'time_and_materials') return null
  const rev = num(input.revisedSum)
  const cs = num(input.contractSum)
  if (rev != null && rev > 0) return rev
  return cs ?? rev
}

export function expectedCaseRevenue(input: {
  contractSum: number | string | null | undefined
  revisedSum: number | string | null | undefined
  registeredSale: number
  netInvoicedExVat: number
  billingModel?: string | null
}): ExpectedRevenue {
  const ref = effectiveContractSum(input)
  if (ref == null) return { revenue: r2(input.registeredSale), basis: 'registered' }
  if (input.netInvoicedExVat > ref) return { revenue: r2(input.netInvoicedExVat), basis: 'invoiced' }
  return { revenue: r2(ref), basis: 'contract' }
}
