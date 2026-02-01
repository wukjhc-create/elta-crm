/**
 * SMS TYPES
 *
 * Type definitions for the SMS notification system using GatewayAPI
 */

// ============================================
// SMS TEMPLATE TYPES
// ============================================

export interface SmsTemplate {
  id: string
  code: string
  name: string
  description: string | null
  template_type: SmsTemplateType
  message_template: string
  available_variables: string[]
  is_default: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SmsTemplateType = 'offer' | 'reminder' | 'notification' | 'followup' | 'custom'

export interface SmsTemplateCreate {
  code: string
  name: string
  description?: string
  template_type: SmsTemplateType
  message_template: string
  available_variables?: string[]
  is_default?: boolean
  is_active?: boolean
}

export interface SmsTemplateUpdate {
  name?: string
  description?: string
  message_template?: string
  available_variables?: string[]
  is_default?: boolean
  is_active?: boolean
}

// ============================================
// SMS MESSAGE TYPES
// ============================================

export interface SmsMessage {
  id: string
  offer_id: string | null
  customer_id: string | null
  to_phone: string
  to_name: string | null
  from_name: string | null
  message: string
  template_id: string | null
  template_variables: Record<string, string> | null
  status: SmsMessageStatus
  gateway_id: string | null
  gateway_status: string | null
  queued_at: string | null
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  error_message: string | null
  error_code: string | null
  cost: number | null
  parts_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SmsMessageStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'failed'

export interface SmsMessageCreate {
  offer_id?: string
  customer_id?: string
  to_phone: string
  to_name?: string
  from_name?: string
  message: string
  template_id?: string
  template_variables?: Record<string, string>
  status?: SmsMessageStatus
}

// ============================================
// SMS EVENT TYPES
// ============================================

export interface SmsEvent {
  id: string
  message_id: string
  event_type: SmsEventType
  gateway_status: string | null
  gateway_error_code: string | null
  gateway_error_message: string | null
  raw_payload: Record<string, unknown> | null
  occurred_at: string
}

export type SmsEventType = 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered'

// ============================================
// SMS PREVIEW TYPES
// ============================================

export interface SmsPreview {
  to_phone: string
  to_name: string
  from_name: string
  message: string
  parts_count: number // Number of SMS parts (160 chars per part)
  variables: Record<string, string>
}

// ============================================
// SMS SEND INPUT TYPES
// ============================================

export interface SendOfferSmsInput {
  offer_id: string
  template_code?: string
  message?: string // Override template message
  to_phone?: string // Override customer phone
}

export interface SendSmsInput {
  to_phone: string
  to_name?: string
  message: string
  offer_id?: string
  customer_id?: string
}

// ============================================
// GATEWAYAPI TYPES
// ============================================

export interface GatewayApiConfig {
  apiKey: string
  secret: string
  senderName: string
}

export interface GatewayApiSendRequest {
  sender: string
  message: string
  recipients: Array<{
    msisdn: string // Phone number in E.164 format
  }>
  callback_url?: string
  class?: 'standard' | 'premium' | 'secret'
  userref?: string // Our internal message ID
}

export interface GatewayApiSendResponse {
  ids: string[] // Array of message IDs
  usage: {
    total_cost: number // In currency smallest unit
    currency: string
    countries: Record<string, unknown>
  }
}

export interface GatewayApiWebhookPayload {
  id: string // GatewayAPI message ID
  msisdn: string // Phone number
  status: 'DELIVERED' | 'UNDELIVERED' | 'EXPIRED' | 'REJECTED' | 'UNKNOWN'
  time: number // Unix timestamp
  error?: string
  code?: string
  userref?: string // Our internal message ID
}

// ============================================
// SMS SETTINGS TYPES
// ============================================

export interface SmsSettings {
  apiKey: string | null
  secret: string | null
  senderName: string | null
  enabled: boolean
}

// ============================================
// STATUS LABELS & COLORS
// ============================================

export const SMS_STATUS_LABELS: Record<SmsMessageStatus, string> = {
  pending: 'Afventer',
  queued: 'I kø',
  sent: 'Sendt',
  delivered: 'Leveret',
  failed: 'Fejlet',
}

export const SMS_STATUS_COLORS: Record<SmsMessageStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  queued: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

// ============================================
// HELPERS
// ============================================

/**
 * Calculate number of SMS parts for a message
 * Standard SMS: 160 chars (7-bit encoding)
 * Unicode SMS: 70 chars
 * Multipart standard: 153 chars per part
 * Multipart unicode: 67 chars per part
 */
export function calculateSmsParts(message: string): number {
  // Check if message contains non-GSM characters (needs unicode)
  const isUnicode = /[^\x00-\x7F]/.test(message) && !/^[\x20-\x7E\n\r]*$/.test(message)

  const length = message.length

  if (isUnicode) {
    if (length <= 70) return 1
    return Math.ceil(length / 67)
  } else {
    if (length <= 160) return 1
    return Math.ceil(length / 153)
  }
}

/**
 * Format phone number to E.164 format (required by GatewayAPI)
 * Danish numbers: +45XXXXXXXX
 */
export function formatPhoneE164(phone: string, countryCode = '45'): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '')

  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '')

  // If it already starts with country code, return as is
  if (cleaned.startsWith(countryCode)) {
    return cleaned
  }

  // If it's a Danish number (8 digits), add country code
  if (cleaned.length === 8) {
    return `${countryCode}${cleaned}`
  }

  // Otherwise return as is (might be international)
  return cleaned
}

/**
 * Validate Danish phone number
 */
export function isValidDanishPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  // Danish numbers are 8 digits (without country code) or 10 with +45
  return cleaned.length === 8 || (cleaned.length === 10 && cleaned.startsWith('45'))
}
