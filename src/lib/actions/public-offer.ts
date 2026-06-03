'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { createServiceCaseFromOffer } from '@/lib/actions/offer-to-case'
import {
  REJECTION_REASON_LABELS,
  type OfferRejectionInput,
} from '@/types/offers.types'

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
      customer:customers!offers_customer_id_fkey(company_name, contact_person, email),
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
    .select('id, status, offer_number, title, final_amount, currency, created_by, customer:customers!offers_customer_id_fkey(company_name, contact_person, email)')
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

  // Phase 10 — autopilot. Default rule "offer_accepted → create_invoice"
  // handles invoice creation now; we still keep the legacy hook as a
  // safety net during the transition. Both paths are idempotent.
  try {
    const { evaluateAndRunAutomations } = await import('@/lib/automation/rule-engine')
    await evaluateAndRunAutomations({
      trigger: 'offer_accepted',
      entityType: 'offer',
      entityId: offerId,
      payload: {
        offer_id: offerId,
        offer_number: offer.offer_number,
        customer_id: (offer as { customer_id?: string }).customer_id ?? null,
        final_amount: offer.final_amount,
      },
    })
  } catch (err) {
    logger.error('Autopilot offer_accepted failed (non-critical)', { error: err, entityId: offerId })
  }

  // Sprint 3D — auto-create service_case (non-critical). Idempotent at
  // app level (offer-to-case.ts) and DB level (uq_service_cases_source_offer_id).
  // If this fails, operator can use manual "Opret sag fra tilbud" button as fallback.
  try {
    const sagResult = await createServiceCaseFromOffer(offerId)
    if (!sagResult.success) {
      logger.error('Auto-create service_case failed', {
        error: sagResult.error,
        entity: 'offer',
        entityId: offerId,
      })
    }
  } catch (sagError) {
    logger.error('Service_case creation failed (non-critical)', {
      error: sagError,
      entity: 'offer',
      entityId: offerId,
    })
  }

  return { success: true }
}

export async function rejectPublicOffer(
  offerId: string,
  input?: OfferRejectionInput | string
): Promise<{ success: boolean; error?: string }> {
  // Normalisér input (validerer reason hvis struktureret)
  const { normalizeRejectionInput, captureRejectionMeta } = await import(
    '@/lib/services/offer-rejection'
  )
  let normalized
  try {
    normalized = normalizeRejectionInput(input)
  } catch (err) {
    logger.error('Invalid rejection input', { error: err, entityId: offerId })
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ugyldig afvisningsårsag',
    }
  }

  // Capture IP/UA (best effort)
  let meta = { ip: 'unknown', userAgent: 'unknown' }
  try {
    meta = await captureRejectionMeta()
  } catch (metaErr) {
    logger.error('Failed to capture rejection meta', { error: metaErr })
  }

  const supabase = await createClient()

  const { data: offer } = await supabase
    .from('offers')
    .select('id, status, offer_number, title, final_amount, currency, created_by, customer_id, customer:customers!offers_customer_id_fkey(company_name, contact_person, email)')
    .eq('id', offerId)
    .single()

  if (!offer) return { success: false, error: 'Tilbud ikke fundet' }
  if (offer.status === 'rejected') return { success: false, error: 'Tilbuddet er allerede afvist' }
  if (offer.status === 'accepted') return { success: false, error: 'Tilbuddet er allerede accepteret' }
  if (!['sent', 'viewed'].includes(offer.status)) return { success: false, error: 'Tilbuddet kan ikke afvises i denne status' }

  // Update med 6 nye strukturerede felter. INGEN notes-prefix længere
  // (offers.notes forbliver rent intern-note-felt).
  const { error } = await supabase
    .from('offers')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: normalized.reason,
      rejection_note: normalized.note,
      rejected_by_name: normalized.signerName,
      rejected_by_email: normalized.signerEmail,
      rejected_by_ip: meta.ip,
      rejected_by_user_agent: meta.userAgent,
    })
    .eq('id', offerId)

  if (error) return { success: false, error: error.message }

  const reasonLabel = REJECTION_REASON_LABELS[normalized.reason]

  // Phase 12A — legacy-flow logger nu ogsaa til offer_activities
  // (matcher portal-flow). performed_by=null fordi public/anon.
  try {
    await supabase.from('offer_activities').insert({
      offer_id: offerId,
      activity_type: 'rejected',
      description: `Tilbud afvist: ${reasonLabel}${normalized.note ? ` — ${normalized.note}` : ''}`,
      performed_by: null,
      metadata: {
        reason: normalized.reason,
        reason_label: reasonLabel,
        note: normalized.note,
        signer_name: normalized.signerName,
        signer_email: normalized.signerEmail,
      },
    })
  } catch (activityErr) {
    // Non-critical — afvis-rowen er allerede gemt
    logger.error('Failed to log rejection activity', { error: activityErr, entityId: offerId })
  }

  // Send notification to employee (med struktureret reason/note)
  try {
    await sendOfferStatusNotification(offer, 'rejected', undefined, {
      reasonLabel,
      note: normalized.note,
      signerName: normalized.signerName,
      signerEmail: normalized.signerEmail,
    })
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
  accepterName?: string,
  rejectionDetails?: {
    reasonLabel: string
    note: string | null
    signerName: string | null
    signerEmail: string | null
  },
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

  const { APP_URL } = await import('@/lib/constants')
  const offerUrl = `${APP_URL}/dashboard/offers/${offer.id}`

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
    rejectionReasonLabel: rejectionDetails?.reasonLabel,
    rejectionNote: rejectionDetails?.note || undefined,
    rejectedByName: rejectionDetails?.signerName || undefined,
    rejectedByEmail: rejectionDetails?.signerEmail || undefined,
  })

  // Sprint 8H Phase 3: central mail-router (internal_notification).
  // recipientEmail er medarbejderens egen mailbox eller GRAPH_MAILBOX-fallback.
  const { resolveInternalNotificationRoute, logMailRoute } = await import(
    '@/lib/actions/mail-route-resolvers'
  )
  const routeResult = await resolveInternalNotificationRoute({
    recipientEmail,
    customerId: offer.customer_id || null,
    contextLabel: `offer_${action}:${offer.offer_number}`,
  })
  if (!routeResult.ok || !routeResult.route) return

  const route = routeResult.route
  const sendResult = await sendEmailViaGraph({
    to: route.toEmail,
    subject,
    html,
    text: `Tilbud ${statusLabel}: ${offer.title} (${offer.offer_number}) — ${finalAmount}. Se: ${offerUrl}`,
  })
  await logMailRoute(
    route,
    sendResult.success ? 'sent' : 'failed',
    { offer_id: offer.id, action, error: sendResult.error }
  )
}
