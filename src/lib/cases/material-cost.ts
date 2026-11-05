/**
 * Den ene regel for materialekost (00248), uden I/O:
 *   KENDT   = endeligt tal, også 0 og negativ returlinje
 *   UKENDT  = NULL
 * NULL må aldrig blive 0. Mangler én påkrævet kost, findes der ingen total, avance eller margin; det kendte beløb og
 * antallet af ukendte linjer står stadig, så de kan vises hver for sig.
 */

export const UNKNOWN_COST_LABEL = 'Ukendt'

/** Tal fra databasen eller et felt. Null, tom tekst og alt ikke-endeligt er ukendt. Number(null) ville give 0. */
export function knownCost(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(n) ? n : null
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface CostSum {
  /** Null, hvis mindst én linje er ukendt */
  total: number | null
  /** Summen af de kendte linjer */
  known: number
  unknownLines: number
  complete: boolean
}

export function sumCosts(values: unknown[]): CostSum {
  let known = 0
  let unknownLines = 0
  for (const value of values) {
    const cost = knownCost(value)
    if (cost == null) unknownLines++
    else known += cost
  }
  const rounded = r2(known)
  return { total: unknownLines === 0 ? rounded : null, known: rounded, unknownLines, complete: unknownLines === 0 }
}

/** Plus med ukendt: et ukendt led gør summen ukendt. */
export function addCosts(...values: Array<number | null>): number | null {
  let sum = 0
  for (const value of values) {
    if (value == null) return null
    sum += value
  }
  return r2(sum)
}

/** Salg minus kost. Null, hvis kosten er ukendt. */
export function marginOf(sale: number, cost: number | null): { amount: number | null; percentage: number | null } {
  if (cost == null) return { amount: null, percentage: null }
  const amount = r2(sale - cost)
  return { amount, percentage: sale > 0 ? r2((amount / sale) * 100) : 0 }
}

/**
 * Omsætter et kostfelt til det, der gemmes. Tomt felt er ukendt, ikke 0. Skrevet 0 er en kendt kost på 0 kr.
 * Negativ kost kun, hvor kalderen tillader det (returlinjer fra leverandør-kreditnota).
 */
export function parseCostInput(value: unknown, opts: { allowNegative?: boolean } = {}): { ok: true; cost: number | null } | { ok: false } {
  if (value == null || value === '') return { ok: true, cost: null }
  const cost = knownCost(value)
  if (cost == null || (cost < 0 && !opts.allowNegative)) return { ok: false }
  return { ok: true, cost }
}
