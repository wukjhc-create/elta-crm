import type {
  ServiceCaseStatus,
  ServiceCasePriority,
  ServiceCaseType,
} from '@/types/service-cases.types'

// Portal Access Token types
export interface PortalAccessToken {
  id: string
  customer_id: string
  token: string
  email: string
  is_active: boolean
  expires_at: string | null
  last_accessed_at: string | null
  created_by: string
  created_at: string
}

export interface PortalAccessTokenWithCustomer extends PortalAccessToken {
  customer: {
    id: string
    customer_number: string
    company_name: string
    contact_person: string
    email: string
    phone: string | null
  }
}

// Portal Message types
export type PortalSenderType = 'customer' | 'employee'

export interface PortalMessage {
  id: string
  customer_id: string
  offer_id: string | null
  sender_type: PortalSenderType
  sender_id: string | null
  sender_name: string | null
  message: string
  attachments: PortalAttachment[]
  read_at: string | null
  created_at: string
}

export interface PortalMessageWithRelations extends PortalMessage {
  sender?: {
    id: string
    full_name: string | null
    email: string
  } | null
  offer?: {
    id: string
    offer_number: string
    title: string
  } | null
}

export interface PortalAttachment {
  name: string
  url: string
  size: number
  type: string
}

// Offer Signature types
export interface OfferSignature {
  id: string
  offer_id: string
  signer_name: string
  signer_email: string
  signer_ip: string | null
  signature_data: string | null
  signed_at: string
}

// Portal session context
export interface PortalSession {
  token: string
  customer_id: string
  customer: {
    id: string
    customer_number: string
    company_name: string
    contact_person: string
    email: string
  }
  expires_at: string | null
}

// Portal offer view (what customer sees)
export interface PortalOffer {
  id: string
  offer_number: string
  title: string
  description: string | null
  status: string
  total_amount: number
  discount_percentage: number
  discount_amount: number
  tax_percentage: number
  tax_amount: number
  final_amount: number
  currency: string
  valid_until: string | null
  terms_and_conditions: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
  line_items: PortalOfferLineItem[]
  signature?: OfferSignature | null
  sales_person: {
    full_name: string | null
    email: string
    phone: string | null
  }
}

export interface PortalOfferLineItem {
  id: string
  position: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_percentage: number
  total: number
}

// Form data types
export interface CreatePortalTokenData {
  customer_id: string
  email: string
  expires_at?: string | null
}

export interface SendPortalMessageData {
  customer_id: string
  offer_id?: string | null
  message: string
  sender_type: PortalSenderType
  sender_name?: string
  attachments?: PortalAttachment[]
}

// File upload types
export interface UploadAttachmentResult {
  path: string
  url: string
  name: string
  size: number
  type: string
}

export interface AcceptOfferData {
  offer_id: string
  signer_name: string
  signer_email: string
  signature_data: string
}

export interface RejectOfferData {
  offer_id: string
  reason?: string
}

// Portal service case view (kunde-sikker delmængde — ALDRIG interne felter som
// budget/contract_sum/planned_hours/formand_id/low_profit/ksr_number/ean_number)
export interface PortalServiceCase {
  id: string
  case_number: string
  title: string
  description: string | null
  status: ServiceCaseStatus
  priority: ServiceCasePriority
  status_note: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  floor_door: string | null
  start_date: string | null
  end_date: string | null
  project_name: string | null
  type: ServiceCaseType | null
  reference: string | null
  created_at: string
}

// Portal invoice view (kunde-sikker, cost-free — KUN salgs-/fakturatal, ALDRIG
// kost/margin/dækningsbidrag). Afledte bool'er beregnes server-side.
export interface PortalInvoice {
  id: string
  invoice_number: string
  status: 'sent' | 'paid'
  payment_status: 'pending' | 'partial' | 'paid'
  invoice_type: 'standard' | 'deposit' | 'progress' | 'final' | 'credit'
  total_amount: number
  tax_amount: number
  final_amount: number
  amount_paid: number
  currency: string
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string
  is_credit_note: boolean
}
