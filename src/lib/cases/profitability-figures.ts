/**
 * Sagsrentabilitetens kosttal. Samme regel som efterkalkulationen: en manglende kost
 * bliver ikke til 0 i summen. compareOfferToActual.totals gør det stadig (N26d/U88-linjelisten).
 */
import type { OfferVsActualRow } from '@/lib/cases/offer-vs-actual'

export interface ProfitabilityFigures {
  offered_cost: number | null
  actual_cost: number | null
  cost_deviation: number | null
  /** Faktisk kost inkl. øvrige, til realiseret DB. null når en brugt kost mangler. */
  db_cost: number | null
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function finite(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Sum af timekost. Tom liste er 0. Ét manglende beløb gør hele summen ukendt. 0 er en gemt nul. */
export function sumLabourCost(amounts: Array<number | string | null>): number | null {
  let sum = 0
  for (const amount of amounts) {
    const n = finite(amount)
    if (n == null) return null
    sum += n
  }
  return sum
}

export function profitabilityFigures(
  rows: OfferVsActualRow[],
  otherTotals: Array<number | string | null>,
): ProfitabilityFigures {
  const offeredIncomplete = rows.some((r) => (r.offered_qty ?? 0) > 0 && r.offered_cost == null)
  const actualIncomplete = rows.some((r) => (r.actual_qty ?? 0) > 0 && r.actual_cost == null)
  const hasOffered = rows.some((r) => r.offered_cost != null)
  const hasActual = rows.some((r) => r.actual_cost != null)
  let other = 0
  let otherIncomplete = false
  for (const total of otherTotals) {
    const n = finite(total)
    if (n == null) {
      otherIncomplete = true
      continue
    }
    other += n
  }
  const offeredSum = r2(rows.reduce((s, r) => s + (r.offered_cost ?? 0), 0))
  const actualSum = r2(rows.reduce((s, r) => s + (r.actual_cost ?? 0), 0))
  const offered_cost = offeredIncomplete || !hasOffered ? null : offeredSum
  const actual_cost = actualIncomplete || !hasActual ? null : actualSum
  return {
    offered_cost,
    actual_cost,
    cost_deviation: offered_cost != null && actual_cost != null ? r2(actual_cost - offered_cost) : null,
    db_cost: actualIncomplete || otherIncomplete ? null : r2((hasActual ? actualSum : 0) + other),
  }
}

/** Største absolutte afvigelse først. Ukendt kost sorteres sidst, ikke som 0. */
export function compareByAbsDeviation(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return Math.abs(b) - Math.abs(a)
}
