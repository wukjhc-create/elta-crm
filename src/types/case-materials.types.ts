/**
 * Sprint 5B — case_materials types.
 *
 * Canonical material consumption on a service_case (sag).
 * Distinct from offer_line_items (quoted) and incoming_invoice_lines (supplied).
 */

export type CaseMaterialSource =
  | 'manual'
  | 'offer'
  | 'supplier_invoice'
  | 'calculator'

export interface CaseMaterialRow {
  id: string
  case_id: string
  work_order_id: string | null
  supplier_product_id: string | null
  material_id: string | null

  description: string
  sku_snapshot: string | null
  supplier_name_snapshot: string | null
  unit: string

  quantity: number
  unit_cost: number
  unit_sales_price: number

  // GENERATED ALWAYS — read-only from app side
  total_cost: number
  total_sales_price: number

  source: CaseMaterialSource
  source_offer_line_id: string | null
  source_incoming_invoice_line_id: string | null

  billable: boolean
  invoice_line_id: string | null

  notes: string | null

  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CaseMaterialsSummary {
  count: number
  total_cost: number
  total_sales_price: number
  /** total_sales_price - total_cost */
  contribution_margin: number
  /** contribution_margin / total_sales_price * 100, 0 if total_sales_price = 0 */
  margin_percentage: number
}
