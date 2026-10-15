/**
 * Efterkalkulation på tværs af sager (Henrik 2026-10-15, fokus A/B: "tilbudt vs faktisk").
 * Rene funktioner (ingen I/O) — bruges af getProjectProfitability og testes isoleret.
 *
 * Tilbudt DB  = tilbudt salg ekskl. moms (tilbuddets final_amount − tax_amount) − tilbudt kost (tilbudslinjernes kost)
 * Realiseret DB = netto faktureret ekskl. moms − faktisk kost (computeRealizedDb)
 * DB-afvigelse = realiseret DB % − tilbudt DB % (procentpoint). Timeafvigelse = (faktiske − estimerede) / estimerede.
 */

export interface OfferedDb { offered_sale: number | null; offered_db: number | null; offered_db_pct: number | null }

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

export function offeredDb(offer: { final_amount: number | string | null; tax_amount: number | string | null } | null, offeredCost: number | null): OfferedDb {
  if (!offer || offer.final_amount == null) return { offered_sale: null, offered_db: null, offered_db_pct: null }
  const sale = r2((Number(offer.final_amount) || 0) - (Number(offer.tax_amount) || 0))
  if (offeredCost == null || sale <= 0) return { offered_sale: sale > 0 ? sale : null, offered_db: null, offered_db_pct: null }
  const db = r2(sale - offeredCost)
  return { offered_sale: sale, offered_db: db, offered_db_pct: r1((db / sale) * 100) }
}

export function hoursDeviationPct(estimated: number | null, actual: number): number | null {
  if (estimated == null || estimated <= 0) return null
  return r1(((actual - estimated) / estimated) * 100)
}

export interface AftercalcRow {
  status: string
  estimated_hours: number | null
  actual_hours: number
  offered_db_pct: number | null
  realized_db_pct: number | null
  cost_deviation: number | null
}

export interface AftercalcSummary {
  cases: number
  /** sager med både estimat og timer — grundlag for gennemsnitlig timeafvigelse */
  hours_basis: number
  avg_hours_deviation_pct: number | null
  over_hours: number
  /** sager med både tilbudt og realiseret DB % */
  db_basis: number
  avg_db_deviation_pp: number | null
  low_db: number
  over_cost: number
}

/** Kun LUKKEDE sager tæller i gennemsnittene (åbne sager er ufærdige og trækker skævt); tællere gælder alle */
export function summarizeAftercalc(rows: AftercalcRow[], minimumDbPct: number): AftercalcSummary {
  const closed = rows.filter((r) => r.status === 'closed')
  const hrs = closed.map((r) => hoursDeviationPct(r.estimated_hours, r.actual_hours)).filter((x): x is number => x != null)
  const dbs = closed.filter((r) => r.offered_db_pct != null && r.realized_db_pct != null).map((r) => (r.realized_db_pct as number) - (r.offered_db_pct as number))
  const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
  return {
    cases: rows.length,
    hours_basis: hrs.length,
    avg_hours_deviation_pct: avg(hrs),
    over_hours: rows.filter((r) => (hoursDeviationPct(r.estimated_hours, r.actual_hours) ?? 0) > 10).length,
    db_basis: dbs.length,
    avg_db_deviation_pp: avg(dbs),
    low_db: rows.filter((r) => r.realized_db_pct != null && r.realized_db_pct < minimumDbPct).length,
    over_cost: rows.filter((r) => (r.cost_deviation ?? 0) > 0).length,
  }
}
