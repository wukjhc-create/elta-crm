/**
 * Sprint 5C — case_other_costs types.
 *
 * Canonical "other costs" on a service_case. Distinct from
 * case_materials (parts) and time_logs (labour). Categories:
 * kørsel, lift, kran, parkering, underleverandør, fragt, gebyr, andet.
 */

export const CASE_OTHER_COST_CATEGORIES = [
  'koersel',
  'lift',
  'kran',
  'parkering',
  'underleverandoer',
  'fragt',
  'gebyr',
  'andet',
] as const

export type CaseOtherCostCategory = (typeof CASE_OTHER_COST_CATEGORIES)[number]

export const CASE_OTHER_COST_CATEGORY_LABELS: Record<CaseOtherCostCategory, string> = {
  koersel: 'Kørsel',
  lift: 'Lift',
  kran: 'Kran',
  parkering: 'Parkering',
  underleverandoer: 'Underleverandør',
  fragt: 'Fragt',
  gebyr: 'Gebyr',
  andet: 'Andet',
}

export const CASE_OTHER_COST_CATEGORY_COLORS: Record<CaseOtherCostCategory, string> = {
  koersel: 'bg-sky-100 text-sky-800',
  lift: 'bg-amber-100 text-amber-800',
  kran: 'bg-orange-100 text-orange-800',
  parkering: 'bg-violet-100 text-violet-800',
  underleverandoer: 'bg-rose-100 text-rose-800',
  fragt: 'bg-cyan-100 text-cyan-800',
  gebyr: 'bg-yellow-100 text-yellow-800',
  andet: 'bg-gray-100 text-gray-700',
}

export type CaseOtherCostSource = 'manual' | 'time_log' | 'supplier_invoice'

export interface CaseOtherCostRow {
  id: string
  case_id: string
  work_order_id: string | null

  category: CaseOtherCostCategory
  description: string
  supplier_name: string | null
  cost_date: string                // YYYY-MM-DD
  unit: string

  quantity: number
  unit_cost: number
  unit_sales_price: number

  // GENERATED ALWAYS
  total_cost: number
  total_sales_price: number

  receipt_url: string | null
  receipt_filename: string | null

  source: CaseOtherCostSource

  billable: boolean
  invoice_line_id: string | null

  notes: string | null

  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CaseOtherCostsSummary {
  count: number
  total_cost: number
  total_sales_price: number
  contribution_margin: number
  margin_percentage: number
}
