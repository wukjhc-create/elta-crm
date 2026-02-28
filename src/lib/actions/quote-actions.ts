'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { generateAndSendQuote } from '@/lib/services/quote-generator'
import type { ActionResult } from '@/types/common.types'
import type {
  GenerateQuoteInput,
  GenerateQuoteResult,
  QuoteCustomerData,
  QuoteLineItem,
} from '@/types/quote-templates.types'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Auto-fill helpers
// =====================================================

/**
 * Get current user's full name for auto-filling sender field.
 * Returns "Fornavn Efternavn" format.
 */
export async function getCurrentUserName(): Promise<ActionResult<string>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    return {
      success: true,
      data: profile?.full_name || '',
    }
  } catch (error) {
    logger.error('Error in getCurrentUserName', { error })
    return { success: false, error: 'Kunne ikke hente brugernavn' }
  }
}

/**
 * Get customer's previous offers for auto-filling quote form.
 * Returns the most recent offer's line items and details.
 */
export async function getCustomerQuoteHistory(
  customerId: string
): Promise<ActionResult<{
  lastOfferTitle?: string
  lastOfferDescription?: string
  lastOfferNotes?: string
  lastLineItems?: QuoteLineItem[]
  totalOffers: number
}>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get the most recent offer for this customer
    const { data: offers, error } = await supabase
      .from('offers')
      .select('id, title, description, notes, terms_and_conditions')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !offers || offers.length === 0) {
      return { success: true, data: { totalOffers: 0 } }
    }

    const lastOffer = offers[0]

    // Get line items from the last offer
    const { data: lineItems } = await supabase
      .from('offer_line_items')
      .select('description, quantity, unit, unit_price, section')
      .eq('offer_id', lastOffer.id)
      .order('position')

    const mappedItems: QuoteLineItem[] = (lineItems || []).map((li) => ({
      id: crypto.randomUUID(),
      description: li.description || '',
      quantity: Number(li.quantity) || 1,
      unit: li.unit || 'stk',
      unitPrice: Number(li.unit_price) || 0,
      section: li.section || undefined,
    }))

    // Get total count of offers
    const { count } = await supabase
      .from('offers')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId)

    return {
      success: true,
      data: {
        lastOfferTitle: lastOffer.title || undefined,
        lastOfferDescription: lastOffer.description || undefined,
        lastOfferNotes: lastOffer.terms_and_conditions || lastOffer.notes || undefined,
        lastLineItems: mappedItems.length > 0 ? mappedItems : undefined,
        totalOffers: count || 0,
      },
    }
  } catch (error) {
    logger.error('Error in getCustomerQuoteHistory', { error })
    return { success: false, error: 'Kunne ikke hente kundehistorik' }
  }
}

/**
 * Main action — generate PDF + send quote email
 */
export async function sendQuoteAction(
  input: GenerateQuoteInput,
  incomingEmailId?: string
): Promise<ActionResult<GenerateQuoteResult>> {
  try {
    const { userId } = await getAuthenticatedClient()

    // Validate required fields
    if (!input.customer.email) {
      return { success: false, error: 'Kunde-email er påkrævet' }
    }
    if (!input.title) {
      return { success: false, error: 'Titel er påkrævet' }
    }
    if (input.lineItems.length === 0) {
      return { success: false, error: 'Mindst én tilbudslinje er påkrævet' }
    }
    if (!input.senderName) {
      return { success: false, error: 'Afsendernavn er påkrævet' }
    }

    const result = await generateAndSendQuote(input, userId, incomingEmailId)

    revalidatePath('/dashboard/mail')

    return { success: result.success, data: result, error: result.error }
  } catch (error) {
    logger.error('Error in sendQuoteAction', { error })
    return { success: false, error: 'Der opstod en fejl ved afsendelse af tilbud' }
  }
}

/**
 * Share a sent quote PDF to the customer portal
 */
export async function shareQuoteToPortal(
  sentQuoteId: string
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Get the sent quote
    const { data: quote, error: quoteError } = await supabase
      .from('sent_quotes')
      .select('id, quote_reference, title, customer_id, customer_email, pdf_public_url, pdf_storage_path')
      .eq('id', sentQuoteId)
      .single()

    if (quoteError || !quote) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Find customer_id if not set — try matching by email
    let customerId = quote.customer_id
    if (!customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', quote.customer_email)
        .maybeSingle()
      customerId = customer?.id || null
    }

    if (!customerId) {
      return { success: false, error: 'Kunden er ikke koblet — kan ikke dele til portal' }
    }

    // Check if already shared
    const { data: existing } = await supabase
      .from('customer_documents')
      .select('id')
      .eq('sent_quote_id', sentQuoteId)
      .maybeSingle()

    if (existing) {
      return { success: true, data: { documentId: existing.id } }
    }

    // Insert document
    const { data: doc, error: insertError } = await supabase
      .from('customer_documents')
      .insert({
        customer_id: customerId,
        title: quote.title,
        description: `Tilbud ${quote.quote_reference}`,
        document_type: 'quote',
        file_url: quote.pdf_public_url,
        storage_path: quote.pdf_storage_path,
        file_name: `${quote.quote_reference}.pdf`,
        mime_type: 'application/pdf',
        sent_quote_id: sentQuoteId,
        shared_by: userId,
      })
      .select('id')
      .single()

    if (insertError || !doc) {
      logger.error('Error sharing quote to portal', { error: insertError })
      return { success: false, error: 'Kunne ikke dele til portal' }
    }

    revalidatePath('/dashboard/mail')
    return { success: true, data: { documentId: doc.id } }
  } catch (error) {
    logger.error('Error in shareQuoteToPortal', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Check if customer has an active portal with chat
 */
export async function checkCustomerPortalAccess(
  customerId: string
): Promise<ActionResult<{ hasPortal: boolean; portalToken?: string }>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data: token } = await supabase
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .limit(1)
      .maybeSingle()

    return {
      success: true,
      data: {
        hasPortal: !!token,
        portalToken: token?.token,
      },
    }
  } catch (error) {
    logger.error('Error in checkCustomerPortalAccess', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Helper — get customer data for pre-filling the quote form
 */
export async function getCustomerForQuote(
  customerId: string
): Promise<ActionResult<QuoteCustomerData>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('customers')
      .select('company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code')
      .eq('id', customerId)
      .single()

    if (error || !data) {
      return { success: false, error: 'Kunde ikke fundet' }
    }

    return {
      success: true,
      data: {
        companyName: data.company_name || '',
        contactPerson: data.contact_person || '',
        email: data.email || '',
        phone: data.phone || undefined,
        address: data.billing_address || undefined,
        city: data.billing_city || undefined,
        postalCode: data.billing_postal_code || undefined,
      },
    }
  } catch (error) {
    logger.error('Error in getCustomerForQuote', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}
