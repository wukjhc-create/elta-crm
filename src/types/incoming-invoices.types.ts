export type IncomingInvoiceSource = 'email' | 'upload' | 'manual'
export type IncomingInvoiceParseStatus = 'pending' | 'parsed' | 'failed' | 'manual'
export type IncomingInvoiceStatus =
  | 'received'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'cancelled'

export interface IncomingInvoiceRow {
  id: string
  source: IncomingInvoiceSource
  source_email_id: string | null
  uploaded_by: string | null
  file_url: string | null
  file_name: string | null
  file_size_bytes: number | null
  mime_type: string | null
  file_hash: string | null
  raw_text: string | null
  supplier_id: string | null
  supplier_name_extracted: string | null
  supplier_vat_number: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  currency: string
  amount_excl_vat: number | null
  vat_amount: number | null
  amount_incl_vat: number | null
  payment_reference: string | null
  iban: string | null
  parse_status: IncomingInvoiceParseStatus
  parse_confidence: number | null
  match_breakdown: Record<string, unknown> | null
  requires_manual_review: boolean
  matched_work_order_id: string | null
  matched_purchase_order_id: string | null
  duplicate_of_id: string | null
  match_confidence: number | null
  status: IncomingInvoiceStatus
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejected_reason: string | null
  external_invoice_id: string | null
  external_provider: string | null
  posted_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface IncomingInvoiceLineRow {
  id: string
  incoming_invoice_id: string
  line_number: number
  description: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total_price: number | null
  supplier_product_id: string | null
  raw_line: string | null
  created_at: string
}

export interface ParsedInvoiceFields {
  supplierName: string | null
  supplierVatNumber: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  amountExclVat: number | null
  vatAmount: number | null
  amountInclVat: number | null
  paymentReference: string | null
  iban: string | null
  currency: string
  workOrderHints: string[]
  /** Supplier-side order references (AO order id, LM ordrenummer, …). */
  supplierOrderRefs: string[]
  /** Customer / delivery address lines extracted from the invoice. */
  deliveryAddressHints: string[]
  /** 0–1 score reflecting how many key fields were extracted. */
  confidence: number
  /** Per-field score (1 if extracted, 0 otherwise). */
  fieldScores: Record<string, number>
}

export interface MatchBreakdown {
  vat_match: number
  supplier_name_match: number
  supplier_order_ref_match: number
  work_order_via_case: number
  work_order_via_title: number
  customer_address_match: number
  duplicate_detected: number
  total: number
  reasons: string[]
}

export interface IngestEmailResult {
  ingested: number
  duplicates: number
  errors: string[]
  invoiceIds: string[]
}
