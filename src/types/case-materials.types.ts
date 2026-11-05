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
  /** 00248: null = ukendt, eller skjult for en bruger uden kost-ret. 0 er en kendt kost på 0 kr. */
  unit_cost: number | null
  unit_sales_price: number

  // GENERATED ALWAYS — read-only from app side
  /** quantity * unit_cost. Null, når unit_cost er null. */
  total_cost: number | null
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
  /** Null, hvis en linje mangler kost eller brugeren ikke må se kost */
  total_cost: number | null
  /** Summen af de kendte linjer. Null uden kost-ret. */
  total_cost_known: number | null
  /** Antal linjer uden kendt kost. Null uden kost-ret, så en montør ikke kan se, om kosten findes. */
  unknown_cost_lines: number | null
  total_sales_price: number
  /** total_sales_price - total_cost. Null, når total_cost er null. */
  contribution_margin: number | null
  /** contribution_margin / total_sales_price * 100, 0 if total_sales_price = 0. Null, når total_cost er null. */
  margin_percentage: number | null
}
