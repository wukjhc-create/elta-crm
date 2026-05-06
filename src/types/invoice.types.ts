export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type InvoicePaymentStatus = 'pending' | 'partial' | 'paid'

export interface InvoiceRow {
  id: string
  invoice_number: string
  customer_id: string | null
  offer_id: string | null
  /** Phase 7.1 — invoice from work_order */
  work_order_id?: string | null
  /** Sprint 6B-1 (mig 00104) — direct sag-link */
  case_id?: string | null
  /** Phase 5.4 — e-conomic linkage when posted */
  external_invoice_id?: string | null
  external_provider?: string | null
  /** Sprint 6D-1 (mig 00105) — multi-stage felter */
  invoice_type?: 'standard' | 'deposit' | 'progress' | 'final' | 'credit'
  billing_percentage?: number | null
  amount_basis?: 'contract_sum' | 'revised_sum' | 'lines'
  amount_basis_value?: number | null
  stage_label?: string | null
  is_final_invoice?: boolean
  status: InvoiceStatus
  total_amount: number
  tax_amount: number
  final_amount: number
  currency: string
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  pdf_url: string | null
  notes: string | null
  payment_reference: string | null
  reminder_count: number
  last_reminder_at: string | null
  payment_status: InvoicePaymentStatus
  amount_paid: number
  created_at: string
  updated_at: string
}

export interface InvoicePaymentRow {
  id: string
  invoice_id: string
  amount: number
  reference: string | null
  recorded_at: string
}

export interface InvoiceLineRow {
  id: string
  invoice_id: string
  position: number
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total_price: number
  created_at: string
  /** Sprint 6B-1 (mig 00104) — provenance to canonical sources */
  source_time_log_id?: string | null
  source_case_material_id?: string | null
  source_case_other_cost_id?: string | null
}

export interface InvoicePdfPayload {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  customer: {
    id: string
    name: string
    address: string | null
    zip: string | null
    city: string | null
    cvr: string | null
    email: string | null
  } | null
  /** Sprint 6C — sag-info for PDF header (case_number + project name). */
  case?: {
    id: string
    case_number: string
    title: string | null
    project_name: string | null
  } | null
  /** Sprint 6C — beregnede totaler (subtotal/vat/final) i pure tal-form. */
  totals?: {
    subtotal: number
    vat: number
    final: number
    vat_rate: number
  }
  /**
   * Sprint 6D-4 — forgængere når invoice.is_final_invoice=true.
   * Hver række mapper én rad i invoice_predecessors, beriget med
   * forgængerens fakturanummer + type/label så PDF kan rendere
   * "Tidligere fakturaer fratrukket"-sektionen uden ekstra opslag.
   * Er undefined eller [] når invoice ikke er final.
   */
  predecessors?: Array<{
    predecessor_invoice_id: string
    predecessor_invoice_number: string
    predecessor_invoice_type: 'deposit' | 'progress' | 'standard' | 'final' | 'credit'
    predecessor_stage_label: string | null
    predecessor_status: 'draft' | 'sent' | 'paid'
    deduction_amount: number
  }>
}
