/**
 * EMAIL INTEGRATION TYPES
 *
 * Type definitions for the complete email system:
 * - Email templates
 * - Email threads (conversations)
 * - Email messages with tracking
 * - Email events for analytics
 */

// =====================================================
// ENUMS AND CONSTANTS
// =====================================================

export const EMAIL_TEMPLATE_TYPES = ['offer', 'reminder', 'notification', 'custom'] as const
export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number]

export const EMAIL_THREAD_STATUSES = ['draft', 'sent', 'opened', 'replied', 'closed'] as const
export type EmailThreadStatus = (typeof EMAIL_THREAD_STATUSES)[number]

export const EMAIL_MESSAGE_STATUSES = [
  'draft',
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'failed',
] as const
export type EmailMessageStatus = (typeof EMAIL_MESSAGE_STATUSES)[number]

export const EMAIL_DIRECTIONS = ['outbound', 'inbound'] as const
export type EmailDirection = (typeof EMAIL_DIRECTIONS)[number]

export const EMAIL_EVENT_TYPES = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'unsubscribed',
] as const
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number]

export const PARSED_INTENTS = ['accept', 'reject', 'question', 'unknown'] as const
export type ParsedIntent = (typeof PARSED_INTENTS)[number]

// =====================================================
// EMAIL TEMPLATES
// =====================================================

export interface EmailTemplate {
  id: string
  code: string
  name: string
  description: string | null
  template_type: EmailTemplateType
  subject_template: string
  body_html_template: string
  body_text_template: string | null
  available_variables: string[]
  is_default: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EmailTemplateCreate {
  code: string
  name: string
  description?: string
  template_type: EmailTemplateType
  subject_template: string
  body_html_template: string
  body_text_template?: string
  available_variables?: string[]
  is_default?: boolean
  is_active?: boolean
}

export interface EmailTemplateUpdate {
  name?: string
  description?: string
  subject_template?: string
  body_html_template?: string
  body_text_template?: string
  available_variables?: string[]
  is_default?: boolean
  is_active?: boolean
}

// =====================================================
// EMAIL THREADS
// =====================================================

export interface EmailThread {
  id: string
  offer_id: string | null
  customer_id: string | null
  subject: string
  status: EmailThreadStatus
  last_message_at: string | null
  last_opened_at: string | null
  last_replied_at: string | null
  message_count: number
  unread_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EmailThreadWithRelations extends EmailThread {
  offer?: {
    id: string
    offer_number: string
    title: string
    status: string
    final_amount: number
  }
  customer?: {
    id: string
    company_name: string | null
    contact_person: string
    email: string
  }
  messages?: EmailMessage[]
  latest_message?: EmailMessage
}

export interface EmailThreadCreate {
  offer_id?: string
  customer_id?: string
  subject: string
  status?: EmailThreadStatus
}

// =====================================================
// EMAIL MESSAGES
// =====================================================

export interface EmailAttachment {
  filename: string
  size: number
  url?: string
  content_type?: string
}

export interface EmailMessage {
  id: string
  thread_id: string
  direction: EmailDirection
  from_email: string
  from_name: string | null
  to_email: string
  to_name: string | null
  reply_to: string | null
  cc: string[] | null
  bcc: string[] | null
  subject: string
  body_html: string | null
  body_text: string | null
  template_id: string | null
  template_variables: Record<string, unknown> | null
  attachments: EmailAttachment[]
  status: EmailMessageStatus
  message_id: string | null
  tracking_id: string | null
  queued_at: string | null
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  failed_at: string | null
  open_count: number
  click_count: number
  error_message: string | null
  retry_count: number
  raw_email: string | null
  parsed_intent: ParsedIntent | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EmailMessageWithRelations extends EmailMessage {
  thread?: EmailThread
  template?: EmailTemplate
  events?: EmailEvent[]
}

export interface EmailMessageCreate {
  thread_id: string
  direction: EmailDirection
  from_email: string
  from_name?: string
  to_email: string
  to_name?: string
  reply_to?: string
  cc?: string[]
  bcc?: string[]
  subject: string
  body_html?: string
  body_text?: string
  template_id?: string
  template_variables?: Record<string, unknown>
  attachments?: EmailAttachment[]
  status?: EmailMessageStatus
}

// =====================================================
// EMAIL EVENTS
// =====================================================

export interface EmailEvent {
  id: string
  message_id: string
  event_type: EmailEventType
  ip_address: string | null
  user_agent: string | null
  link_url: string | null
  bounce_type: 'hard' | 'soft' | null
  bounce_reason: string | null
  occurred_at: string
}

export interface EmailEventCreate {
  message_id: string
  event_type: EmailEventType
  ip_address?: string
  user_agent?: string
  link_url?: string
  bounce_type?: 'hard' | 'soft'
  bounce_reason?: string
}

// =====================================================
// SEND EMAIL INPUT/OUTPUT
// =====================================================

export interface SendOfferEmailInput {
  offer_id: string
  template_code?: string // Default: 'offer_send'
  subject?: string // Override template subject
  body_html?: string // Override template body
  body_text?: string
  cc?: string[]
  bcc?: string[]
  attachments?: EmailAttachment[]
  include_pdf?: boolean // Attach offer PDF
}

export interface SendOfferEmailResult {
  success: boolean
  thread_id?: string
  message_id?: string
  tracking_id?: string
  error?: string
}

export interface ResendEmailInput {
  message_id: string
  update_subject?: string
  update_body_html?: string
}

// =====================================================
// EMAIL PREVIEW
// =====================================================

export interface EmailPreview {
  subject: string
  body_html: string
  body_text: string
  from_email: string
  from_name: string
  to_email: string
  to_name: string
  variables: Record<string, string>
}

export interface GenerateEmailPreviewInput {
  offer_id: string
  template_code?: string
}

// =====================================================
// TEMPLATE VARIABLES
// =====================================================

export interface OfferEmailVariables {
  customer_name: string
  offer_number: string
  offer_title: string
  offer_description: string
  total_amount: string
  valid_until: string
  portal_link: string
  company_name: string
  company_email: string
  company_phone: string
  company_address: string
  sender_name: string
  tracking_pixel: string
}

// =====================================================
// STATUS HELPERS
// =====================================================

export const THREAD_STATUS_LABELS: Record<EmailThreadStatus, string> = {
  draft: 'Kladde',
  sent: 'Sendt',
  opened: 'Åbnet',
  replied: 'Besvaret',
  closed: 'Lukket',
}

export const MESSAGE_STATUS_LABELS: Record<EmailMessageStatus, string> = {
  draft: 'Kladde',
  queued: 'I kø',
  sent: 'Sendt',
  delivered: 'Leveret',
  opened: 'Åbnet',
  clicked: 'Klikket',
  bounced: 'Afvist',
  failed: 'Fejlet',
}

export const THREAD_STATUS_COLORS: Record<EmailThreadStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  opened: 'bg-green-100 text-green-700',
  replied: 'bg-purple-100 text-purple-700',
  closed: 'bg-gray-100 text-gray-700',
}

export const MESSAGE_STATUS_COLORS: Record<EmailMessageStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  queued: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-cyan-100 text-cyan-700',
  opened: 'bg-green-100 text-green-700',
  clicked: 'bg-emerald-100 text-emerald-700',
  bounced: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
}
