/**
 * Filtrering og sortering af efterkalkulations-oversigten. Ren funktion — ingen I/O.
 * SQL har allerede afgrænset periode, ansvarlig og status. Her håndteres afvigelse,
 * manglende kost og sortering, og siden skæres bagefter.
 */
import type { DataQualityCode } from '@/lib/cases/aftercalc'

export const AFTERCALC_PAGE_SIZE = 25

/** Nyeste sager i filtret. Én række mere end dette fortæller, at ældre sager ikke er beregnet. */
export const AFTERCALC_CASE_WINDOW = 200

export function takeCaseWindow<T>(rows: readonly T[]): { rows: T[]; truncated: boolean } {
  if (rows.length > AFTERCALC_CASE_WINDOW) {
    return { rows: rows.slice(0, AFTERCALC_CASE_WINDOW), truncated: true }
  }
  return { rows: rows.slice(), truncated: false }
}

export const AFTERCALC_SORTS = ['worst_db', 'biggest_loss', 'biggest_gain', 'missing_data', 'newest'] as const
export type AftercalcSort = (typeof AFTERCALC_SORTS)[number]

export const AFTERCALC_VARIANCE_FILTERS = ['all', 'negative', 'positive'] as const
export type AftercalcVarianceFilter = (typeof AFTERCALC_VARIANCE_FILTERS)[number]

export interface AftercalcOverviewRow {
  case_id: string
  case_number: string
  title: string
  customer_name: string | null
  assignee_name: string | null
  status: string
  created_at: string
  quoted_revenue: number | null
  actual_revenue: number | null
  quoted_db_pct: number | null
  actual_db_pct: number | null
  /** Faktisk DB − tilbudt DB, i kroner. */
  db_variance: number | null
  db_variance_pct_points: number | null
  data_quality: 'ok' | 'warning'
  warning_codes: DataQualityCode[]
  invoiced_state: 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced'
}

export interface AftercalcOverviewItem {
  row: AftercalcOverviewRow
  /** Faktisk DB i kroner. Bruges kun til sortering. */
  actual_db: number | null
}

export interface AftercalcOverviewQuery {
  variance?: AftercalcVarianceFilter | null
  missingCostOnly?: boolean | null
  sort?: AftercalcSort | null
  page?: number | null
}

const MISSING_COST: ReadonlySet<DataQualityCode> = new Set([
  'missing_cost_price',
  'missing_frozen_labour_cost',
  'offer_without_cost_basis',
])

function cmpNum(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * direction
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface AftercalcOverviewFilters {
  from?: string | null
  to?: string | null
  assigneeId?: string | null
  status?: string | null
  variance?: AftercalcVarianceFilter | null
  missingCostOnly?: boolean | null
  sort?: AftercalcSort | null
  page?: number | null
}

export interface AftercalcOverviewResult {
  rows: AftercalcOverviewRow[]
  total: number
  page: number
  pageSize: number
  /** Flere sager end vinduet på 200. Ældre sager er ikke beregnet. */
  truncated: boolean
  cases_considered: number
  query_ms: number
  assignees: { id: string; full_name: string | null }[]
}

export function selectOverviewPage(
  items: readonly AftercalcOverviewItem[],
  query: AftercalcOverviewQuery,
): { rows: AftercalcOverviewRow[]; total: number; page: number; pageSize: number } {
  let list = items.slice()
  const variance = query.variance ?? 'all'
  if (variance === 'negative') list = list.filter((i) => i.row.db_variance != null && i.row.db_variance < 0)
  if (variance === 'positive') list = list.filter((i) => i.row.db_variance != null && i.row.db_variance > 0)
  if (query.missingCostOnly) list = list.filter((i) => i.row.warning_codes.some((c) => MISSING_COST.has(c)))

  const sort = query.sort ?? 'newest'
  list.sort((a, b) => {
    const tie = cmpText(a.row.case_number, b.row.case_number)
    if (sort === 'worst_db') return cmpNum(a.row.db_variance, b.row.db_variance, 1) || tie
    if (sort === 'biggest_loss') return cmpNum(a.actual_db, b.actual_db, 1) || tie
    if (sort === 'biggest_gain') return cmpNum(a.actual_db, b.actual_db, -1) || tie
    if (sort === 'missing_data') {
      const aw = a.row.data_quality === 'warning' ? 0 : 1
      const bw = b.row.data_quality === 'warning' ? 0 : 1
      if (aw !== bw) return aw - bw
      const byCount = b.row.warning_codes.length - a.row.warning_codes.length
      return byCount || tie
    }
    const byDate = cmpText(b.row.created_at, a.row.created_at)
    return byDate || tie
  })

  const total = list.length
  const pages = Math.max(1, Math.ceil(total / AFTERCALC_PAGE_SIZE))
  const page = Math.min(Math.max(query.page ?? 1, 1), pages)
  const start = (page - 1) * AFTERCALC_PAGE_SIZE
  return {
    rows: list.slice(start, start + AFTERCALC_PAGE_SIZE).map((i) => i.row),
    total,
    page,
    pageSize: AFTERCALC_PAGE_SIZE,
  }
}
