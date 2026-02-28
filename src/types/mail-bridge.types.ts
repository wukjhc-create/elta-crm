/**
 * Mail Bridge Types
 *
 * Types for the incoming email system: Graph API polling,
 * customer linking, and AO product detection.
 */

// =====================================================
// Database row types
// =====================================================

export type EmailLinkStatus = 'linked' | 'unidentified' | 'ignored' | 'pending'

export interface IncomingEmail {
  id: string
  graph_message_id: string | null
  conversation_id: string | null
  subject: string
  sender_email: string
  sender_name: string | null
  original_sender_email: string | null
  original_sender_name: string | null
  to_email: string | null
  cc: string[]
  reply_to: string | null
  body_html: string | null
  body_text: string | null
  body_preview: string | null
  attachment_urls: EmailAttachment[]
  has_attachments: boolean
  link_status: EmailLinkStatus
  customer_id: string | null
  customer_contact_id: string | null
  linked_by: 'auto' | 'manual'
  linked_at: string | null
  ao_product_matches: AOProductMatch[]
  has_ao_matches: boolean
  is_read: boolean
  is_archived: boolean
  is_forwarded: boolean
  processed_at: string | null
  received_at: string
  created_at: string
  updated_at: string
}

export interface IncomingEmailWithCustomer extends IncomingEmail {
  customers?: {
    id: string
    company_name: string
    contact_person: string
    email: string
    customer_number: string
  } | null
}

export interface EmailAttachment {
  filename: string
  contentType: string
  size: number
  url: string
}

export interface AOProductMatch {
  sku: string
  name: string | null
  found_in: 'body' | 'subject'
  current_price: number | null
  supplier_product_id: string | null
}

// =====================================================
// Graph API types
// =====================================================

export interface GraphSyncState {
  id: string
  mailbox: string
  delta_link: string | null
  last_sync_at: string | null
  last_sync_status: string
  last_sync_error: string | null
  emails_synced_total: number
  created_at: string
  updated_at: string
}

export interface GraphMailMessage {
  id: string
  conversationId: string | null
  subject: string | null
  bodyPreview: string
  body: {
    contentType: string
    content: string
  }
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
  toRecipients: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  ccRecipients: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  replyTo: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  hasAttachments: boolean
  attachments?: GraphAttachment[]
  receivedDateTime: string
  isRead: boolean
}

export interface GraphAttachment {
  id: string
  name: string
  contentType: string
  size: number
  contentBytes?: string // base64
}

export interface GraphDeltaResponse {
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
  value: GraphMailMessage[]
}

// =====================================================
// Linker types
// =====================================================

export interface LinkResult {
  emailId: string
  status: EmailLinkStatus
  customerId: string | null
  customerContactId: string | null
  matchedOn: 'email' | 'domain' | 'name' | null
  confidence: 'high' | 'medium' | 'low'
}

// =====================================================
// Sync result types
// =====================================================

export interface EmailSyncResult {
  success: boolean
  emailsFetched: number
  emailsInserted: number
  emailsSkipped: number
  emailsLinked: number
  aoMatchesFound: number
  kalkiaPricesUpdated: number
  attachmentsStored: number
  errors: string[]
  durationMs: number
}
