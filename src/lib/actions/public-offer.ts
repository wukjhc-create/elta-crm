'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface PublicOffer {
  id: string
  offer_number: string
  title: string
  description: string | null
  scope: string | null
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
  notes: string | null
  created_at: string
  customer: {
    company_name: string
    contact_person: string
    email: string
  } | null
  line_items: Array<{
    id: string
    position: number
    description: string
    quantity: number
    unit: string
    unit_price: number
    discount_percentage: number
    total: number
    section: string | null
  }>
}

export interface PublicOfferMessage {
  id: string
  sender_type: 'customer' | 'employee'
  sender_name: string | null
  message: string
  created_at: string
}

export async function getPublicOffer(offerId: string): Promise<PublicOffer | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('offers')
    .select(`
      id, offer_number, title, description, scope, status,
      total_amount, discount_percentage, discount_amount,
      tax_percentage, tax_amount, final_amount, currency,
      valid_until, terms_and_conditions, notes, created_at,
      customer:customers(company_name, contact_person, email),
      line_items:offer_line_items(id, position, description, quantity, unit, unit_price, discount_percentage, total, section)
    `)
    .eq('id', offerId)
    .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
    .maybeSingle()

  if (error) {
    logger.error('Failed to fetch public offer', { error, entityId: offerId })
    return null
  }

  if (!data) return null

  // Mark as viewed if currently "sent"
  if (data.status === 'sent') {
    await supabase
      .from('offers')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', offerId)
  }

  // Sort line items
  if (data.line_items) {
    data.line_items.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
  }

  return data as unknown as PublicOffer
}

export async function getPublicOfferMessages(offerId: string): Promise<PublicOfferMessage[]> {
  const supabase = await createClient()

  // First get customer_id from the offer
  const { data: offer } = await supabase
    .from('offers')
    .select('customer_id')
    .eq('id', offerId)
    .maybeSingle()

  if (!offer?.customer_id) return []

  const { data, error } = await supabase
    .from('portal_messages')
    .select('id, sender_type, sender_name, message, created_at')
    .eq('customer_id', offer.customer_id)
    .or(`offer_id.eq.${offerId},offer_id.is.null`)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    logger.error('Failed to fetch public offer messages', { error, entityId: offerId })
    return []
  }

  return (data || []) as PublicOfferMessage[]
}

export async function sendPublicOfferMessage(
  offerId: string,
  senderName: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!message.trim()) return { success: false, error: 'Besked kan ikke være tom' }
  if (!senderName.trim()) return { success: false, error: 'Indtast dit navn' }

  const supabase = await createClient()

  // Get customer_id from offer
  const { data: offer } = await supabase
    .from('offers')
    .select('customer_id')
    .eq('id', offerId)
    .maybeSingle()

  if (!offer?.customer_id) return { success: false, error: 'Tilbud ikke fundet' }

  const { error } = await supabase
    .from('portal_messages')
    .insert({
      customer_id: offer.customer_id,
      offer_id: offerId,
      sender_type: 'customer',
      sender_name: senderName.trim(),
      message: message.trim(),
    })

  if (error) {
    logger.error('Failed to send public offer message', { error, entityId: offerId })
    return { success: false, error: 'Kunne ikke sende besked' }
  }

  return { success: true }
}

export async function acceptPublicOffer(offerId: string, accepterName: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: offer } = await supabase
    .from('offers')
    .select('id, status, offer_number, title, final_amount, currency, created_by, customer:customers(company_name, contact_person, email)')
    .eq('id', offerId)
    .single()

  if (!offer) return { success: false, error: 'Tilbud ikke fundet' }
  if (offer.status === 'accepted') return { success: false, error: 'Tilbuddet er allerede accepteret' }
  if (!['sent', 'viewed'].includes(offer.status)) return { success: false, error: 'Tilbuddet kan ikke accepteres i denne status' }

  const { error } = await supabase
    .from('offers')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', offerId)

  if (error) return { success: false, error: error.message }

  // Log signature
  try {
    await supabase.from('offer_signatures').insert({
      offer_id: offerId,
      signer_name: accepterName,
      signed_at: new Date().toISOString(),
      ip_address: null,
    })
  } catch { /* ignore */ }

  // Send notification to employee
  try {
    await sendOfferStatusNotification(offer, 'accepted', accepterName)
  } catch (err) {
    logger.error('Failed to send acceptance notification', { error: err, entityId: offerId })
  }

  return { success: true }
}

export async function rejectPublicOffer(
  offerId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: offer } = await supabase
    .from('offers')
    .select('id, status, offer_number, title, final_amount, currency, created_by, customer:customers(company_name, contact_person, email)')
    .eq('id', offerId)
    .single()

  if (!offer) return { success: false, error: 'Tilbud ikke fundet' }
  if (offer.status === 'rejected') return { success: false, error: 'Tilbuddet er allerede afvist' }
  if (offer.status === 'accepted') return { success: false, error: 'Tilbuddet er allerede accepteret' }
  if (!['sent', 'viewed'].includes(offer.status)) return { success: false, error: 'Tilbuddet kan ikke afvises i denne status' }

  const updateData: Record<string, unknown> = {
    status: 'rejected',
    rejected_at: new Date().toISOString(),
  }
  if (reason) {
    updateData.notes = `Afvist via portal: ${reason}`
  }

  const { error } = await supabase
    .from('offers')
    .update(updateData)
    .eq('id', offerId)

  if (error) return { success: false, error: error.message }

  // Send notification to employee
  try {
    await sendOfferStatusNotification(offer, 'rejected')
  } catch (err) {
    logger.error('Failed to send rejection notification', { error: err, entityId: offerId })
  }

  return { success: true }
}

// Send internal notification email when offer is accepted/rejected
async function sendOfferStatusNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any,
  action: 'accepted' | 'rejected',
  accepterName?: string
) {
  const { isGraphConfigured, getMailbox, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  const { generateOfferNotificationHtml } = await import('@/lib/email/templates/offer-notification-email')

  if (!isGraphConfigured()) return

  const supabase = await createClient()

  // Get employee email
  let recipientEmail: string | null = null
  if (offer.created_by) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', offer.created_by)
      .maybeSingle()
    recipientEmail = profile?.email || null
  }

  // Fallback to Graph mailbox
  if (!recipientEmail) {
    recipientEmail = getMailbox()
  }
  if (!recipientEmail) return

  const customer = offer.customer as { company_name: string; contact_person: string; email: string } | null
  const finalAmount = new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: offer.currency || 'DKK',
    maximumFractionDigits: 0,
  }).format(offer.final_amount || 0)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app'
  const offerUrl = `${baseUrl}/dashboard/offers/${offer.id}`

  const statusLabel = action === 'accepted' ? 'Accepteret' : 'Afvist'
  const subject = `Tilbud ${statusLabel}: ${offer.title} (${offer.offer_number})`

  const html = generateOfferNotificationHtml({
    action,
    customerName: customer?.contact_person || 'Kunde',
    companyName: customer?.company_name || '',
    offerNumber: offer.offer_number,
    offerTitle: offer.title,
    finalAmount,
    accepterName,
    offerUrl,
  })

  await sendEmailViaGraph({
    to: recipientEmail,
    subject,
    html,
    text: `Tilbud ${statusLabel}: ${offer.title} (${offer.offer_number}) — ${finalAmount}. Se: ${offerUrl}`,
  })
}
