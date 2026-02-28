'use server'

/**
 * Server Actions — Incoming Emails (Mail Bridge)
 *
 * CRUD operations + sync trigger + manual link for incoming emails.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import type {
  IncomingEmailWithCustomer,
  EmailLinkStatus,
  EmailSyncResult,
  GraphSyncState,
} from '@/types/mail-bridge.types'

// =====================================================
// READ operations
// =====================================================

export async function getIncomingEmails(options?: {
  filter?: EmailLinkStatus | 'all' | 'ao_matches'
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ data: IncomingEmailWithCustomer[]; count: number }> {
  const supabase = await createClient()
  const filter = options?.filter || 'all'
  const page = options?.page || 1
  const pageSize = options?.pageSize || 25
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('incoming_emails')
    .select(
      `
      *,
      customers (
        id,
        company_name,
        contact_person,
        email,
        customer_number
      )
    `,
      { count: 'exact' }
    )
    .eq('is_archived', false)
    .order('received_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // Apply filters
  if (filter === 'linked') {
    query = query.eq('link_status', 'linked')
  } else if (filter === 'unidentified') {
    query = query.eq('link_status', 'unidentified')
  } else if (filter === 'pending') {
    query = query.eq('link_status', 'pending')
  } else if (filter === 'ignored') {
    query = query.eq('link_status', 'ignored')
  } else if (filter === 'ao_matches') {
    query = query.eq('has_ao_matches', true)
  }

  // Apply search
  if (options?.search) {
    const term = `%${options.search}%`
    query = query.or(
      `subject.ilike.${term},sender_email.ilike.${term},sender_name.ilike.${term},original_sender_email.ilike.${term}`
    )
  }

  const { data, count, error } = await query

  if (error) {
    logger.error('Failed to fetch incoming emails', { error })
    return { data: [], count: 0 }
  }

  return {
    data: (data || []) as unknown as IncomingEmailWithCustomer[],
    count: count || 0,
  }
}

export async function getIncomingEmail(
  id: string
): Promise<IncomingEmailWithCustomer | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('incoming_emails')
    .select(
      `
      *,
      customers (
        id,
        company_name,
        contact_person,
        email,
        customer_number
      )
    `
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logger.error('Failed to fetch incoming email', { entityId: id, error })
    return null
  }

  return data as unknown as IncomingEmailWithCustomer
}

export async function getIncomingEmailStats(): Promise<{
  total: number
  unread: number
  unidentified: number
  linked: number
  aoMatches: number
}> {
  const supabase = await createClient()

  const [totalRes, unreadRes, unidentifiedRes, linkedRes, aoRes] = await Promise.all([
    supabase.from('incoming_emails').select('id', { count: 'exact', head: true }).eq('is_archived', false),
    supabase.from('incoming_emails').select('id', { count: 'exact', head: true }).eq('is_read', false).eq('is_archived', false),
    supabase.from('incoming_emails').select('id', { count: 'exact', head: true }).eq('link_status', 'unidentified').eq('is_archived', false),
    supabase.from('incoming_emails').select('id', { count: 'exact', head: true }).eq('link_status', 'linked').eq('is_archived', false),
    supabase.from('incoming_emails').select('id', { count: 'exact', head: true }).eq('has_ao_matches', true).eq('is_archived', false),
  ])

  return {
    total: totalRes.count || 0,
    unread: unreadRes.count || 0,
    unidentified: unidentifiedRes.count || 0,
    linked: linkedRes.count || 0,
    aoMatches: aoRes.count || 0,
  }
}

// =====================================================
// WRITE operations
// =====================================================

export async function markEmailAsRead(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('incoming_emails')
    .update({ is_read: true })
    .eq('id', id)

  if (error) throw new Error(`Kunne ikke markere som læst: ${error.message}`)
  revalidatePath('/dashboard/mail')
}

export async function archiveEmail(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('incoming_emails')
    .update({ is_archived: true })
    .eq('id', id)

  if (error) throw new Error(`Kunne ikke arkivere: ${error.message}`)
  revalidatePath('/dashboard/mail')
}

export async function linkEmailToCustomer(
  emailId: string,
  customerId: string
): Promise<void> {
  const { manuallyLinkEmail } = await import('@/lib/services/email-linker')
  await manuallyLinkEmail(emailId, customerId)
  revalidatePath('/dashboard/mail')
}

export async function ignoreIncomingEmail(emailId: string): Promise<void> {
  const { ignoreEmail } = await import('@/lib/services/email-linker')
  await ignoreEmail(emailId)
  revalidatePath('/dashboard/mail')
}

// =====================================================
// CREATE CUSTOMER FROM EMAIL
// =====================================================

/**
 * Create a new customer (+ lead) from an incoming email.
 * If the sender email already matches a customer, links instead of creating.
 */
export async function createCustomerFromEmail(
  emailId: string
): Promise<{ success: boolean; customerId?: string; isExisting?: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Ikke logget ind' }

  // 1. Fetch the email
  const email = await getIncomingEmail(emailId)
  if (!email) return { success: false, error: 'Email ikke fundet' }

  // 2. Determine sender info (prefer original for forwarded emails)
  const senderEmail = email.original_sender_email || email.sender_email
  const senderName = email.original_sender_name || email.sender_name || senderEmail

  if (!senderEmail) return { success: false, error: 'Ingen afsender-email fundet' }

  // 3. Check for existing customer by email
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, company_name, customer_number')
    .ilike('email', senderEmail)
    .limit(1)
    .maybeSingle()

  if (existingCustomer) {
    // Link the email to existing customer
    await supabase
      .from('incoming_emails')
      .update({
        customer_id: existingCustomer.id,
        link_status: 'linked',
        linked_by: 'auto-create',
      })
      .eq('id', emailId)

    revalidatePath('/dashboard/mail')
    revalidatePath('/dashboard/customers')
    return { success: true, customerId: existingCustomer.id, isExisting: true }
  }

  // 4. Generate customer number
  const { data: lastCustomer } = await supabase
    .from('customers')
    .select('customer_number')
    .order('customer_number', { ascending: false })
    .limit(1)

  let nextNumber = 'C000001'
  if (lastCustomer && lastCustomer.length > 0) {
    const lastNum = parseInt((lastCustomer[0] as any).customer_number.substring(1), 10)
    nextNumber = 'C' + (lastNum + 1).toString().padStart(6, '0')
  }

  // 5. Create customer
  const { data: newCustomer, error: customerError } = await supabase
    .from('customers')
    .insert({
      customer_number: nextNumber,
      company_name: senderName,
      contact_person: senderName,
      email: senderEmail,
      tags: ['email'],
      notes: `Oprettet fra email: "${email.subject}"`,
      is_active: true,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (customerError) {
    logger.error('Failed to create customer from email', { error: customerError })
    return { success: false, error: customerError.message }
  }

  // 6. Create lead
  await supabase.from('leads').insert({
    company_name: senderName,
    contact_person: senderName,
    email: senderEmail,
    status: 'new',
    source: 'email',
    notes: `Email emne: ${email.subject}`,
    tags: ['email'],
    created_by: user.id,
  })

  // 7. Link the email
  await supabase
    .from('incoming_emails')
    .update({
      customer_id: newCustomer.id,
      link_status: 'linked',
      linked_by: 'auto-create',
    })
    .eq('id', emailId)

  logger.info('Customer created from email', {
    entity: 'customers',
    entityId: newCustomer.id,
    metadata: { emailId, senderEmail },
  })

  revalidatePath('/dashboard/mail')
  revalidatePath('/dashboard/customers')
  return { success: true, customerId: newCustomer.id }
}

// =====================================================
// AO / KALKIA PRICE operations
// =====================================================

/**
 * Get Kalkia price update suggestions for an email's AO matches.
 */
export async function getEmailKalkiaSuggestions(emailId: string) {
  const email = await getIncomingEmail(emailId)
  if (!email || !email.ao_product_matches || email.ao_product_matches.length === 0) {
    return { suggestions: [], autoUpdatedCount: 0, manualReviewCount: 0 }
  }

  const { getKalkiaPriceUpdateSuggestions } = await import(
    '@/lib/services/email-ao-detector'
  )
  const suggestions = await getKalkiaPriceUpdateSuggestions(email.ao_product_matches)
  return {
    suggestions,
    autoUpdatedCount: 0,
    manualReviewCount: suggestions.length,
  }
}

/**
 * Apply Kalkia price updates for detected AO products in an email.
 * Updates materials with auto_update_price enabled, returns summary.
 */
export async function applyEmailKalkiaPriceUpdates(emailId: string) {
  const email = await getIncomingEmail(emailId)
  if (!email || !email.ao_product_matches || email.ao_product_matches.length === 0) {
    return { suggestions: [], autoUpdatedCount: 0, manualReviewCount: 0 }
  }

  const { applyKalkiaPriceUpdates } = await import(
    '@/lib/services/email-ao-detector'
  )
  const result = await applyKalkiaPriceUpdates(email.ao_product_matches)
  revalidatePath('/dashboard/mail')
  return result
}

// =====================================================
// SYNC operations
// =====================================================

export async function getGraphSyncState(): Promise<GraphSyncState | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('graph_sync_state')
    .select('*')
    .limit(1)
    .maybeSingle()

  return data as GraphSyncState | null
}

/**
 * Trigger a manual email sync (calls the same logic as the cron).
 * Returns sync result summary.
 */
export async function triggerEmailSync(): Promise<EmailSyncResult> {
  const { runEmailSync } = await import('@/lib/services/email-sync-orchestrator')
  const result = await runEmailSync()
  revalidatePath('/dashboard/mail')
  return result
}

/**
 * Test Microsoft Graph connection.
 */
export async function testGraphConnection(): Promise<{
  success: boolean
  mailbox: string
  error?: string
}> {
  const { isGraphConfigured, testGraphConnection: testConn } = await import(
    '@/lib/services/microsoft-graph'
  )

  if (!isGraphConfigured()) {
    return {
      success: false,
      mailbox: process.env.GRAPH_MAILBOX || 'crm@eltasolar.dk',
      error: 'Microsoft Graph er ikke konfigureret. Sæt AZURE_TENANT_ID, AZURE_CLIENT_ID og AZURE_CLIENT_SECRET.',
    }
  }

  return testConn()
}
