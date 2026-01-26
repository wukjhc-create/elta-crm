'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { createProjectFromOffer } from '@/lib/actions/projects'
import type {
  PortalAccessToken,
  PortalAccessTokenWithCustomer,
  PortalSession,
  PortalOffer,
  PortalMessage,
  PortalMessageWithRelations,
  OfferSignature,
  CreatePortalTokenData,
  SendPortalMessageData,
  AcceptOfferData,
} from '@/types/portal.types'
import type { ActionResult } from '@/types/common.types'

// =====================================================
// Portal Token Management (for employees)
// =====================================================

// Create portal access token for a customer
export async function createPortalToken(
  data: CreatePortalTokenData
): Promise<ActionResult<PortalAccessToken>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Generate secure token
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const { data: tokenData, error } = await supabase
      .from('portal_access_tokens')
      .insert({
        customer_id: data.customer_id,
        email: data.email,
        token,
        expires_at: data.expires_at || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating portal token:', error)
      return { success: false, error: 'Kunne ikke oprette portal-adgang' }
    }

    revalidatePath('/customers')
    return { success: true, data: tokenData as PortalAccessToken }
  } catch (error) {
    console.error('Error in createPortalToken:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get portal tokens for a customer
export async function getPortalTokens(
  customerId: string
): Promise<ActionResult<PortalAccessToken[]>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('portal_access_tokens')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching portal tokens:', error)
      return { success: false, error: 'Kunne ikke hente portal-adgange' }
    }

    return { success: true, data: data as PortalAccessToken[] }
  } catch (error) {
    console.error('Error in getPortalTokens:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Deactivate portal token
export async function deactivatePortalToken(
  tokenId: string
): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('portal_access_tokens')
      .update({ is_active: false })
      .eq('id', tokenId)

    if (error) {
      console.error('Error deactivating token:', error)
      return { success: false, error: 'Kunne ikke deaktivere adgang' }
    }

    revalidatePath('/customers')
    return { success: true }
  } catch (error) {
    console.error('Error in deactivatePortalToken:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Access (for customers via token)
// =====================================================

// Validate portal token and get session
export async function validatePortalToken(
  token: string
): Promise<ActionResult<PortalSession>> {
  try {
    const supabase = await createClient()

    const { data: tokenData, error } = await supabase
      .from('portal_access_tokens')
      .select(`
        *,
        customer:customers(
          id,
          customer_number,
          company_name,
          contact_person,
          email
        )
      `)
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (error || !tokenData) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    // Check if token is expired
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return { success: false, error: 'Adgangen er udløbet' }
    }

    // Update last accessed timestamp
    await supabase
      .from('portal_access_tokens')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    const session: PortalSession = {
      token: tokenData.token,
      customer_id: tokenData.customer_id,
      customer: tokenData.customer,
      expires_at: tokenData.expires_at,
    }

    return { success: true, data: session }
  } catch (error) {
    console.error('Error in validatePortalToken:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get offers for customer (portal view)
export async function getPortalOffers(
  token: string
): Promise<ActionResult<PortalOffer[]>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    const { data: offers, error } = await supabase
      .from('offers')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching portal offers:', error)
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    // Get line items for each offer
    const offersWithItems: PortalOffer[] = await Promise.all(
      (offers || []).map(async (offer) => {
        const { data: lineItems } = await supabase
          .from('offer_line_items')
          .select('*')
          .eq('offer_id', offer.id)
          .order('position')

        const { data: signature } = await supabase
          .from('offer_signatures')
          .select('*')
          .eq('offer_id', offer.id)
          .single()

        return {
          id: offer.id,
          offer_number: offer.offer_number,
          title: offer.title,
          description: offer.description,
          status: offer.status,
          total_amount: offer.total_amount,
          discount_percentage: offer.discount_percentage,
          discount_amount: offer.discount_amount,
          tax_percentage: offer.tax_percentage,
          tax_amount: offer.tax_amount,
          final_amount: offer.final_amount,
          currency: offer.currency,
          valid_until: offer.valid_until,
          terms_and_conditions: offer.terms_and_conditions,
          sent_at: offer.sent_at,
          viewed_at: offer.viewed_at,
          accepted_at: offer.accepted_at,
          rejected_at: offer.rejected_at,
          created_at: offer.created_at,
          line_items: lineItems || [],
          signature: signature || null,
          sales_person: {
            full_name: null,
            email: '',
            phone: null,
          },
        }
      })
    )

    return { success: true, data: offersWithItems }
  } catch (error) {
    console.error('Error in getPortalOffers:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single offer for portal
export async function getPortalOffer(
  token: string,
  offerId: string
): Promise<ActionResult<PortalOffer>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    const { data: offer, error } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .single()

    if (error || !offer) {
      console.error('Error fetching offer:', error)
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Mark as viewed if first time
    if (!offer.viewed_at && offer.status === 'sent') {
      await supabase
        .from('offers')
        .update({
          viewed_at: new Date().toISOString(),
          status: 'viewed',
        })
        .eq('id', offerId)

      // Log view activity
      await logOfferActivity(
        offerId,
        'viewed',
        'Tilbud åbnet i kundeportalen',
        null,
        { viewedViaPortal: true }
      )
    }

    // Get line items
    const { data: lineItems } = await supabase
      .from('offer_line_items')
      .select('*')
      .eq('offer_id', offerId)
      .order('position')

    // Get signature if exists
    const { data: signature } = await supabase
      .from('offer_signatures')
      .select('*')
      .eq('offer_id', offerId)
      .single()

    const portalOffer: PortalOffer = {
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      description: offer.description,
      status: offer.status,
      total_amount: offer.total_amount,
      discount_percentage: offer.discount_percentage,
      discount_amount: offer.discount_amount,
      tax_percentage: offer.tax_percentage,
      tax_amount: offer.tax_amount,
      final_amount: offer.final_amount,
      currency: offer.currency,
      valid_until: offer.valid_until,
      terms_and_conditions: offer.terms_and_conditions,
      sent_at: offer.sent_at,
      viewed_at: offer.viewed_at,
      accepted_at: offer.accepted_at,
      rejected_at: offer.rejected_at,
      created_at: offer.created_at,
      line_items: lineItems || [],
      signature: signature || null,
      sales_person: {
        full_name: null,
        email: '',
        phone: null,
      },
    }

    return { success: true, data: portalOffer }
  } catch (error) {
    console.error('Error in getPortalOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Accept offer with signature
export async function acceptOffer(
  token: string,
  data: AcceptOfferData
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer and get details for project creation
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id, title, final_amount')
      .eq('id', data.offer_id)
      .eq('customer_id', customerId)
      .single()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (offer.status === 'accepted') {
      return { success: false, error: 'Tilbuddet er allerede accepteret' }
    }

    if (offer.status === 'rejected') {
      return { success: false, error: 'Tilbuddet er allerede afvist' }
    }

    // Get client IP
    const headersList = await headers()
    const clientIp = headersList.get('x-forwarded-for') ||
                     headersList.get('x-real-ip') ||
                     'unknown'

    // Create signature
    const { error: signatureError } = await supabase
      .from('offer_signatures')
      .insert({
        offer_id: data.offer_id,
        signer_name: data.signer_name,
        signer_email: data.signer_email,
        signer_ip: clientIp,
        signature_data: data.signature_data,
      })

    if (signatureError) {
      console.error('Error creating signature:', signatureError)
      return { success: false, error: 'Kunne ikke gemme underskrift' }
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from('offers')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', data.offer_id)

    if (updateError) {
      console.error('Error updating offer:', updateError)
      return { success: false, error: 'Kunne ikke opdatere tilbud' }
    }

    // Log acceptance activity
    await logOfferActivity(
      data.offer_id,
      'accepted',
      `Tilbud accepteret af ${data.signer_name} (${data.signer_email})`,
      null, // No user ID for portal actions
      { signerName: data.signer_name, signerEmail: data.signer_email, signerIp: clientIp }
    )

    // Auto-create project from accepted offer
    const projectResult = await createProjectFromOffer(
      data.offer_id,
      customerId,
      offer.title,
      offer.final_amount
    )

    if (projectResult.success && projectResult.data) {
      // Log project creation activity
      await logOfferActivity(
        data.offer_id,
        'project_created',
        `Projekt ${projectResult.data.project_number} oprettet automatisk`,
        null,
        { projectId: projectResult.data.id, projectNumber: projectResult.data.project_number }
      )
    } else {
      console.error('Error auto-creating project:', projectResult.error)
      // Don't fail the offer acceptance if project creation fails
    }

    revalidatePath('/offers')
    revalidatePath('/projects')

    return { success: true }
  } catch (error) {
    console.error('Error in acceptOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Reject offer
export async function rejectOffer(
  token: string,
  offerId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .single()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (offer.status === 'accepted') {
      return { success: false, error: 'Tilbuddet er allerede accepteret' }
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from('offers')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        notes: reason ? `Afvist med begrundelse: ${reason}` : undefined,
      })
      .eq('id', offerId)

    if (updateError) {
      console.error('Error rejecting offer:', updateError)
      return { success: false, error: 'Kunne ikke afvise tilbud' }
    }

    // Log rejection activity
    await logOfferActivity(
      offerId,
      'rejected',
      reason ? `Tilbud afvist: ${reason}` : 'Tilbud afvist',
      null,
      { reason: reason || null }
    )

    revalidatePath('/offers')

    return { success: true }
  } catch (error) {
    console.error('Error in rejectOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Messages
// =====================================================

// Get messages for portal (customer view)
export async function getPortalMessages(
  token: string,
  offerId?: string
): Promise<ActionResult<PortalMessageWithRelations[]>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    let query = supabase
      .from('portal_messages')
      .select(`
        *,
        sender:profiles(id, full_name, email),
        offer:offers(id, offer_number, title)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (offerId) {
      query = query.eq('offer_id', offerId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching portal messages:', error)
      return { success: false, error: 'Kunne ikke hente beskeder' }
    }

    return { success: true, data: data as PortalMessageWithRelations[] }
  } catch (error) {
    console.error('Error in getPortalMessages:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send message from portal (customer)
export async function sendPortalMessage(
  token: string,
  data: SendPortalMessageData
): Promise<ActionResult<PortalMessage>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    // Verify customer_id matches token
    if (data.customer_id !== customerId) {
      return { success: false, error: 'Ugyldig kunde' }
    }

    const { data: message, error } = await supabase
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: data.offer_id || null,
        sender_type: 'customer',
        sender_name: data.sender_name || sessionResult.data.customer.contact_person,
        message: data.message,
      })
      .select()
      .single()

    if (error) {
      console.error('Error sending portal message:', error)
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    return { success: true, data: message as PortalMessage }
  } catch (error) {
    console.error('Error in sendPortalMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send message from employee to customer
export async function sendEmployeeMessage(
  customerId: string,
  message: string,
  offerId?: string
): Promise<ActionResult<PortalMessage>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Get employee name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const { data: messageData, error } = await supabase
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: offerId || null,
        sender_type: 'employee',
        sender_id: user.id,
        sender_name: profile?.full_name || 'Medarbejder',
        message,
      })
      .select()
      .single()

    if (error) {
      console.error('Error sending employee message:', error)
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    revalidatePath('/customers')
    revalidatePath('/offers')
    return { success: true, data: messageData as PortalMessage }
  } catch (error) {
    console.error('Error in sendEmployeeMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Mark portal messages as read
export async function markPortalMessagesAsRead(
  token: string,
  messageIds: string[]
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('portal_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', messageIds)
      .eq('sender_type', 'employee')

    if (error) {
      console.error('Error marking messages as read:', error)
      return { success: false, error: 'Kunne ikke markere som læst' }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in markPortalMessagesAsRead:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get unread message count for employee view
export async function getUnreadPortalMessageCount(
  customerId?: string
): Promise<ActionResult<number>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    let query = supabase
      .from('portal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_type', 'customer')
      .is('read_at', null)

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { count, error } = await query

    if (error) {
      console.error('Error fetching unread count:', error)
      return { success: false, error: 'Kunne ikke hente antal ulæste' }
    }

    return { success: true, data: count || 0 }
  } catch (error) {
    console.error('Error in getUnreadPortalMessageCount:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
