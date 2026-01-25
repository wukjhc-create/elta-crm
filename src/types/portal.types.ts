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
