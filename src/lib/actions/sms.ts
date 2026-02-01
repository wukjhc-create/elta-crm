'use server'

/**
 * SMS SERVER ACTIONS
 *
 * Server actions for SMS functionality using GatewayAPI:
 * - Template management (CRUD)
 * - Send SMS to customers
 * - Message history
 * - GatewayAPI integration
 */

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/common.types'
import type {
  SmsTemplate,
  SmsTemplateCreate,
  SmsTemplateUpdate,
  SmsMessage,
  SmsMessageCreate,
  SmsEvent,
  SmsPreview,
  SendOfferSmsInput,
  SmsSettings,
  GatewayApiConfig,
  GatewayApiSendResponse,
  calculateSmsParts,
  formatPhoneE164,
} from '@/types/sms.types'

// ============================================
// SMS SETTINGS
// ============================================

export async function getSmsSettings(): Promise<ActionResult<SmsSettings>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('company_settings')
      .select('sms_gateway_api_key, sms_gateway_secret, sms_sender_name, sms_enabled')
      .single()

    if (error) {
      console.error('Error fetching SMS settings:', error)
      return { success: false, error: 'Kunne ikke hente SMS indstillinger' }
    }

    return {
      success: true,
      data: {
        apiKey: data.sms_gateway_api_key,
        secret: data.sms_gateway_secret,
        senderName: data.sms_sender_name,
        enabled: data.sms_enabled || false,
      },
    }
  } catch (error) {
    console.error('Error in getSmsSettings:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateSmsSettings(settings: Partial<{
  apiKey: string | null
  secret: string | null
  senderName: string | null
  enabled: boolean
}>): Promise<ActionResult<void>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const updateData: Record<string, unknown> = {}
    if (settings.apiKey !== undefined) updateData.sms_gateway_api_key = settings.apiKey
    if (settings.secret !== undefined) updateData.sms_gateway_secret = settings.secret
    if (settings.senderName !== undefined) updateData.sms_sender_name = settings.senderName
    if (settings.enabled !== undefined) updateData.sms_enabled = settings.enabled

    const { error } = await supabase
      .from('company_settings')
      .update(updateData)
      .not('id', 'is', null)

    if (error) {
      console.error('Error updating SMS settings:', error)
      return { success: false, error: 'Kunne ikke opdatere SMS indstillinger' }
    }

    revalidatePath('/dashboard/settings/sms')
    return { success: true }
  } catch (error) {
    console.error('Error in updateSmsSettings:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// SMS TEMPLATES
// ============================================

export async function getSmsTemplates(options?: {
  type?: string
  active_only?: boolean
}): Promise<SmsTemplate[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('sms_templates')
      .select('*')
      .order('name')

    if (options?.type) {
      query = query.eq('template_type', options.type)
    }

    if (options?.active_only) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching SMS templates:', error)
      return []
    }

    return data as SmsTemplate[]
  } catch (error) {
    console.error('Error in getSmsTemplates:', error)
    return []
  }
}

export async function getSmsTemplate(id: string): Promise<ActionResult<SmsTemplate>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching SMS template:', error)
      return { success: false, error: 'Kunne ikke hente SMS skabelon' }
    }

    return { success: true, data: data as SmsTemplate }
  } catch (error) {
    console.error('Error in getSmsTemplate:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function getSmsTemplateByCode(code: string): Promise<ActionResult<SmsTemplate>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('code', code)
      .single()

    if (error) {
      console.error('Error fetching SMS template by code:', error)
      return { success: false, error: 'Kunne ikke hente SMS skabelon' }
    }

    return { success: true, data: data as SmsTemplate }
  } catch (error) {
    console.error('Error in getSmsTemplateByCode:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function createSmsTemplate(
  input: SmsTemplateCreate
): Promise<ActionResult<SmsTemplate>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sms_templates')
      .insert({
        ...input,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating SMS template:', error)
      if (error.code === '23505') {
        return { success: false, error: 'En skabelon med denne kode findes allerede' }
      }
      return { success: false, error: 'Kunne ikke oprette SMS skabelon' }
    }

    revalidatePath('/dashboard/settings/sms')
    return { success: true, data: data as SmsTemplate }
  } catch (error) {
    console.error('Error in createSmsTemplate:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateSmsTemplate(
  id: string,
  input: SmsTemplateUpdate
): Promise<ActionResult<SmsTemplate>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sms_templates')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating SMS template:', error)
      return { success: false, error: 'Kunne ikke opdatere SMS skabelon' }
    }

    revalidatePath('/dashboard/settings/sms')
    return { success: true, data: data as SmsTemplate }
  } catch (error) {
    console.error('Error in updateSmsTemplate:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function deleteSmsTemplate(id: string): Promise<ActionResult<void>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('sms_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting SMS template:', error)
      return { success: false, error: 'Kunne ikke slette SMS skabelon' }
    }

    revalidatePath('/dashboard/settings/sms')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteSmsTemplate:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// SMS MESSAGES
// ============================================

export async function getSmsMessages(options?: {
  offer_id?: string
  customer_id?: string
  limit?: number
}): Promise<SmsMessage[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('sms_messages')
      .select('*')
      .order('created_at', { ascending: false })

    if (options?.offer_id) {
      query = query.eq('offer_id', options.offer_id)
    }

    if (options?.customer_id) {
      query = query.eq('customer_id', options.customer_id)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching SMS messages:', error)
      return []
    }

    return data as SmsMessage[]
  } catch (error) {
    console.error('Error in getSmsMessages:', error)
    return []
  }
}

export async function createSmsMessage(
  input: SmsMessageCreate
): Promise<ActionResult<SmsMessage>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sms_messages')
      .insert({
        ...input,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating SMS message:', error)
      return { success: false, error: 'Kunne ikke oprette SMS besked' }
    }

    return { success: true, data: data as SmsMessage }
  } catch (error) {
    console.error('Error in createSmsMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// SMS PREVIEW & RENDERING
// ============================================

/**
 * Render template with variables
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
    rendered = rendered.replace(regex, value || '')
  }
  return rendered
}

/**
 * Calculate SMS parts for a message
 */
function calculateParts(message: string): number {
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
 * Format phone to E.164 (Danish)
 */
function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '')
  cleaned = cleaned.replace(/^0+/, '')

  if (cleaned.startsWith('45')) {
    return cleaned
  }

  if (cleaned.length === 8) {
    return `45${cleaned}`
  }

  return cleaned
}

/**
 * Generate SMS preview for an offer
 */
export async function generateSmsPreview(input: {
  offer_id: string
  template_code?: string
  message?: string
}): Promise<ActionResult<SmsPreview>> {
  try {
    const supabase = await createClient()

    // Get offer with customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        customer:customers(*)
      `)
      .eq('id', input.offer_id)
      .single()

    if (offerError || !offer) {
      console.error('Error fetching offer:', offerError)
      return { success: false, error: 'Kunne ikke finde tilbuddet' }
    }

    // Get company settings
    const { data: settings } = await supabase
      .from('company_settings')
      .select('company_name, sms_sender_name')
      .single()

    // Get template if specified
    let template: SmsTemplate | null = null
    if (input.template_code && !input.message) {
      const { data } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('code', input.template_code)
        .single()

      template = data as SmsTemplate | null
    }

    // Build variables
    const portalToken = await getOrCreatePortalToken(offer.id, offer.customer_id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const variables: Record<string, string> = {
      customer_name: offer.customer?.contact_person || offer.customer?.company_name || 'Kunde',
      offer_number: offer.offer_number || offer.id.slice(0, 8),
      offer_title: offer.title || 'Tilbud',
      total_amount: new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK',
      }).format(offer.total_amount || 0),
      valid_until: offer.valid_until
        ? new Date(offer.valid_until).toLocaleDateString('da-DK')
        : 'Ikke angivet',
      portal_link: `${appUrl}/portal/${portalToken}`,
      company_name: settings?.company_name || 'Elta Solar',
    }

    // Render message
    const message = input.message || (template?.message_template
      ? renderTemplate(template.message_template, variables)
      : `Hej ${variables.customer_name}! Se dit tilbud her: ${variables.portal_link}`)

    const preview: SmsPreview = {
      to_phone: formatPhone(offer.customer?.phone || ''),
      to_name: offer.customer?.contact_person || offer.customer?.company_name || 'Kunde',
      from_name: settings?.sms_sender_name || 'Elta Solar',
      message,
      parts_count: calculateParts(message),
      variables,
    }

    return { success: true, data: preview }
  } catch (error) {
    console.error('Error in generateSmsPreview:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// GATEWAYAPI INTEGRATION
// ============================================

/**
 * Send SMS via GatewayAPI
 */
async function sendViaGatewayApi(
  config: GatewayApiConfig,
  phone: string,
  message: string,
  userRef?: string
): Promise<ActionResult<{ gatewayId: string; cost: number }>> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // GatewayAPI uses Basic Auth with API key and secret
    const authString = Buffer.from(`${config.apiKey}:${config.secret}`).toString('base64')

    const response = await fetch('https://gatewayapi.com/rest/mtsms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`,
      },
      body: JSON.stringify({
        sender: config.senderName.substring(0, 11), // Max 11 chars
        message,
        recipients: [{ msisdn: phone }],
        callback_url: `${appUrl}/api/sms/webhook`,
        userref: userRef,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GatewayAPI error:', errorText)
      return { success: false, error: `GatewayAPI fejl: ${response.status}` }
    }

    const data = await response.json() as GatewayApiSendResponse

    return {
      success: true,
      data: {
        gatewayId: data.ids[0],
        cost: data.usage.total_cost,
      },
    }
  } catch (error) {
    console.error('Error sending via GatewayAPI:', error)
    return { success: false, error: 'Kunne ikke sende SMS via GatewayAPI' }
  }
}

/**
 * Test GatewayAPI connection
 */
export async function testGatewayApiConnection(config: {
  apiKey: string
  secret: string
}): Promise<ActionResult<{ balance: number; currency: string }>> {
  try {
    const authString = Buffer.from(`${config.apiKey}:${config.secret}`).toString('base64')

    const response = await fetch('https://gatewayapi.com/rest/me', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Ugyldige API credentials' }
    }

    const data = await response.json()

    return {
      success: true,
      data: {
        balance: data.credit || 0,
        currency: data.currency || 'DKK',
      },
    }
  } catch (error) {
    console.error('Error testing GatewayAPI:', error)
    return { success: false, error: 'Kunne ikke oprette forbindelse til GatewayAPI' }
  }
}

/**
 * Send test SMS
 */
export async function sendTestSms(
  phone: string,
  config: { apiKey: string; secret: string; senderName: string }
): Promise<ActionResult<void>> {
  try {
    const formattedPhone = formatPhone(phone)
    const message = `Test SMS fra Elta CRM. Hvis du modtager denne besked, virker SMS integrationen korrekt.`

    const result = await sendViaGatewayApi(
      config,
      formattedPhone,
      message
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  } catch (error) {
    console.error('Error sending test SMS:', error)
    return { success: false, error: 'Kunne ikke sende test SMS' }
  }
}

// ============================================
// SEND OFFER SMS
// ============================================

/**
 * Get or create portal token for an offer
 */
async function getOrCreatePortalToken(offerId: string, customerId: string): Promise<string> {
  const supabase = await createClient()

  // Check for existing token
  const { data: existing } = await supabase
    .from('portal_access_tokens')
    .select('token')
    .eq('customer_id', customerId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing?.token) {
    return existing.token
  }

  // Create new token
  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30) // 30 days

  await supabase.from('portal_access_tokens').insert({
    customer_id: customerId,
    token,
    expires_at: expiresAt.toISOString(),
  })

  return token
}

/**
 * Send SMS for an offer
 */
export async function sendOfferSms(
  input: SendOfferSmsInput
): Promise<ActionResult<{ message_id: string; gateway_id: string }>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Get SMS settings
    const settingsResult = await getSmsSettings()
    if (!settingsResult.success || !settingsResult.data?.apiKey) {
      return { success: false, error: 'SMS er ikke konfigureret. Gå til Indstillinger → SMS.' }
    }

    const smsSettings = settingsResult.data
    if (!smsSettings.enabled) {
      return { success: false, error: 'SMS er deaktiveret. Aktiver det i Indstillinger → SMS.' }
    }

    // Generate preview to get message content
    const previewResult = await generateSmsPreview({
      offer_id: input.offer_id,
      template_code: input.template_code || 'offer_send',
      message: input.message,
    })

    if (!previewResult.success || !previewResult.data) {
      return { success: false, error: previewResult.error || 'Kunne ikke generere SMS' }
    }

    const preview = previewResult.data
    const phone = input.to_phone || preview.to_phone

    if (!phone) {
      return { success: false, error: 'Kunden har ikke et telefonnummer' }
    }

    // Get offer for customer_id
    const { data: offer } = await supabase
      .from('offers')
      .select('customer_id')
      .eq('id', input.offer_id)
      .single()

    // Create message record first
    const messageResult = await createSmsMessage({
      offer_id: input.offer_id,
      customer_id: offer?.customer_id,
      to_phone: phone,
      to_name: preview.to_name,
      from_name: preview.from_name,
      message: preview.message,
      template_variables: preview.variables,
      status: 'pending',
    })

    if (!messageResult.success || !messageResult.data) {
      return { success: false, error: 'Kunne ikke oprette SMS besked' }
    }

    const message = messageResult.data

    // Send via GatewayAPI
    const sendResult = await sendViaGatewayApi(
      {
        apiKey: smsSettings.apiKey!,
        secret: smsSettings.secret!,
        senderName: smsSettings.senderName || 'Elta Solar',
      },
      formatPhone(phone),
      preview.message,
      message.id
    )

    if (!sendResult.success) {
      // Update message status to failed
      await supabase
        .from('sms_messages')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: sendResult.error,
        })
        .eq('id', message.id)

      return { success: false, error: sendResult.error }
    }

    const gatewayData = sendResult.data!

    // Update message with gateway info
    await supabase
      .from('sms_messages')
      .update({
        status: 'sent',
        gateway_id: gatewayData.gatewayId,
        cost: gatewayData.cost,
        sent_at: new Date().toISOString(),
        parts_count: preview.parts_count,
      })
      .eq('id', message.id)

    // Update offer status if it was draft
    const { data: currentOffer } = await supabase
      .from('offers')
      .select('status')
      .eq('id', input.offer_id)
      .single()

    if (currentOffer?.status === 'draft') {
      await supabase
        .from('offers')
        .update({ status: 'sent' })
        .eq('id', input.offer_id)
    }

    revalidatePath(`/dashboard/offers/${input.offer_id}`)

    return {
      success: true,
      data: {
        message_id: message.id,
        gateway_id: gatewayData.gatewayId,
      },
    }
  } catch (error) {
    console.error('Error sending offer SMS:', error)
    return { success: false, error: 'Der opstod en fejl ved afsendelse af SMS' }
  }
}

// ============================================
// SMS EVENTS (for webhooks)
// ============================================

export async function createSmsEvent(input: {
  message_id: string
  event_type: string
  gateway_status?: string
  gateway_error_code?: string
  gateway_error_message?: string
  raw_payload?: Record<string, unknown>
}): Promise<ActionResult<SmsEvent>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sms_events')
      .insert(input)
      .select()
      .single()

    if (error) {
      console.error('Error creating SMS event:', error)
      return { success: false, error: 'Kunne ikke oprette SMS event' }
    }

    return { success: true, data: data as SmsEvent }
  } catch (error) {
    console.error('Error in createSmsEvent:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Handle GatewayAPI webhook (called from API route)
 */
export async function handleSmsWebhook(payload: {
  id: string // Gateway message ID
  msisdn: string
  status: string
  time: number
  error?: string
  code?: string
  userref?: string // Our message ID
}): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient()

    // Find message by gateway_id or userref
    const { data: message } = await supabase
      .from('sms_messages')
      .select('id')
      .or(`gateway_id.eq.${payload.id},id.eq.${payload.userref || ''}`)
      .single()

    if (!message) {
      console.error('SMS message not found for webhook:', payload)
      return { success: false, error: 'Besked ikke fundet' }
    }

    // Map GatewayAPI status to our event type
    const eventTypeMap: Record<string, string> = {
      'DELIVERED': 'delivered',
      'UNDELIVERED': 'undelivered',
      'EXPIRED': 'failed',
      'REJECTED': 'failed',
      'UNKNOWN': 'failed',
      'BUFFERED': 'queued',
      'ENROUTE': 'sent',
    }

    const eventType = eventTypeMap[payload.status] || 'failed'

    // Create event
    await createSmsEvent({
      message_id: message.id,
      event_type: eventType,
      gateway_status: payload.status,
      gateway_error_code: payload.code,
      gateway_error_message: payload.error,
      raw_payload: payload as Record<string, unknown>,
    })

    return { success: true }
  } catch (error) {
    console.error('Error handling SMS webhook:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
