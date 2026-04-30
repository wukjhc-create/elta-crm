export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type InvoicePaymentStatus = 'pending' | 'partial' | 'paid'

export interface InvoiceRow {
  id: string
  invoice_number: string
  customer_id: string | null
  offer_id: string | null
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
}
