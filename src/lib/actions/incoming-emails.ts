'use server'

/**
 * Server Actions — Incoming Emails (Mail Bridge)
 *
 * CRUD operations + sync trigger + manual link for incoming emails.
 */

import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
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
  readFilter?: 'all' | 'read' | 'unread'
  sortOrder?: 'newest' | 'oldest'
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ data: IncomingEmailWithCustomer[]; count: number }> {
  const supabase = await createClient()
  const filter = options?.filter || 'all'
  const readFilter = options?.readFilter || 'all'
  const sortOrder = options?.sortOrder || 'newest'
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
    .order('received_at', { ascending: sortOrder === 'oldest' })
    .range(offset, offset + pageSize - 1)

  // Apply link status filter
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

  // Apply read/unread filter
  if (readFilter === 'unread') {
    query = query.eq('is_read', false)
  } else if (readFilter === 'read') {
    query = query.eq('is_read', true)
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
// LEAD LOOKUP (for duplicate prevention)
// =====================================================

/**
 * Check if a lead was already created from this email.
 * Returns the lead ID + company name if found, null otherwise.
 */
export async function getLeadForEmail(
  emailId: string
): Promise<{ id: string; company_name: string; status: string } | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('leads')
    .select('id, company_name, status')
    .eq('custom_fields->>source_email_id', emailId)
    .limit(1)
    .maybeSingle()

  return data as { id: string; company_name: string; status: string } | null
}

/**
 * Batch check: which email IDs already have leads created from them.
 * Returns a map of emailId → leadId.
 */
export async function getLeadsForEmails(
  emailIds: string[]
): Promise<Record<string, { leadId: string; status: string }>> {
  if (emailIds.length === 0) return {}
  const supabase = await createClient()

  const { data } = await supabase
    .from('leads')
    .select('id, status, custom_fields')
    .in('source', ['email'])

  if (!data) return {}

  const map: Record<string, { leadId: string; status: string }> = {}
  for (const lead of data) {
    const cf = lead.custom_fields as Record<string, unknown> | null
    const sourceEmailId = cf?.source_email_id as string | undefined
    if (sourceEmailId && emailIds.includes(sourceEmailId)) {
      map[sourceEmailId] = { leadId: lead.id, status: lead.status }
    }
  }
  return map
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

export async function markEmailAsUnread(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('incoming_emails')
    .update({ is_read: false })
    .eq('id', id)

  if (error) throw new Error(`Kunne ikke markere som ulæst: ${error.message}`)
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
 * Clean email subject: strip Re:/Fwd:/SV:/VS: prefixes and trim.
 */
function cleanSubject(subject: string | null): string {
  if (!subject) return 'Ukendt emne'
  return subject
    .replace(/^(?:(?:Re|Fwd|Fw|SV|VS|VB)\s*:\s*)+/gi, '')
    .trim() || 'Ukendt emne'
}

/**
 * Extract phone numbers from text using common Danish and international patterns.
 * Returns the first match or null.
 */
function extractPhoneNumber(text: string | null): string | null {
  if (!text) return null
  // Danish patterns: +45 12 34 56 78, 12345678, 12 34 56 78, (+45) 12345678
  // International: +XX XXXXXXXX
  const patterns = [
    /(?:\+45[\s.-]?)?(?:\d[\s.-]?){8}/,               // Danish 8-digit
    /\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/, // International
    /(?:tlf|tel|telefon|mobil|mob|ring)[.:;\s]+([+\d][\d\s.-]{6,15})/i,  // Prefixed with label
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      // Clean up: collapse whitespace/dots/dashes, return digits and +
      const raw = match[1] || match[0]
      const cleaned = raw.replace(/[\s.-]/g, '').trim()
      // Must be at least 8 digits
      if (cleaned.replace(/\D/g, '').length >= 8) {
        return cleaned
      }
    }
  }
  return null
}

/**
 * Build lead notes from email data: clean subject as title,
 * body preview for context, and full body for reference.
 */
function buildLeadNotes(
  subject: string,
  bodyText: string | null,
  bodyPreview: string | null,
  senderEmail: string,
  receivedAt: string
): string {
  const parts: string[] = []

  // Header with metadata
  const dateStr = new Date(receivedAt).toLocaleDateString('da-DK', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  parts.push(`Oprettet fra email modtaget ${dateStr}`)
  parts.push(`Fra: ${senderEmail}`)
  parts.push(`Emne: ${subject}`)
  parts.push('')

  // Full email body (prefer plain text, truncate at 4000 chars to stay safe in DB)
  const body = bodyText || bodyPreview || ''
  if (body) {
    parts.push('--- Original besked ---')
    parts.push(body.length > 4000 ? body.substring(0, 4000) + '\n\n[Beskeden er forkortet]' : body)
  }

  return parts.join('\n')
}

/**
 * Copy email attachments to a lead-specific folder in Supabase Storage.
 * Source: email-attachments/{emailId}/*
 * Dest:   lead-attachments/{leadId}/*
 */
async function copyAttachmentsToLead(emailId: string, leadId: string): Promise<void> {
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  const serviceSupabase = createServiceClient(url, key)

  // Get attachment URLs from the email record
  const { data: email } = await serviceSupabase
    .from('incoming_emails')
    .select('attachment_urls')
    .eq('id', emailId)
    .single()

  const attachments = (email?.attachment_urls || []) as Array<{
    filename: string
    storagePath?: string
    contentType?: string
    size?: number
    url?: string
  }>

  if (attachments.length === 0) return

  for (const att of attachments) {
    if (!att.storagePath) continue

    try {
      // Download from source path
      const { data: fileData, error: dlError } = await serviceSupabase.storage
        .from('attachments')
        .download(att.storagePath)

      if (dlError || !fileData) continue

      // Upload to lead folder
      const destPath = `lead-attachments/${leadId}/${att.filename}`
      await serviceSupabase.storage
        .from('attachments')
        .upload(destPath, fileData, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: true,
        })

      logger.info('Attachment copied to lead folder', {
        entity: 'leads',
        entityId: leadId,
        metadata: { filename: att.filename, destPath },
      })
    } catch {
      // Non-critical — log and continue
      logger.warn('Failed to copy single attachment', {
        metadata: { emailId, leadId, filename: att.filename },
      })
    }
  }
}

/**
 * Create a new customer (+ lead) from an incoming email.
 * If the sender email already matches a customer, links instead of creating.
 *
 * Enhancements:
 * - Extracts phone number from email body
 * - Cleans subject (strips Re:/Fwd: prefixes) for lead title
 * - Stores full email body in lead notes for traceability
 * - Stores source email ID in lead custom_fields
 */
export async function createCustomerFromEmail(
  emailId: string
): Promise<{ success: boolean; customerId?: string; leadId?: string; isExisting?: boolean; customerName?: string; error?: string }> {
  validateUUID(emailId, 'emailId')
  const { supabase, userId } = await getAuthenticatedClient()

  // 1. Fetch the email
  const email = await getIncomingEmail(emailId)
  if (!email) return { success: false, error: 'Email ikke fundet' }

  // 2. Determine sender info (prefer original for forwarded emails)
  const senderEmail = email.original_sender_email || email.sender_email
  const senderName = email.original_sender_name || email.sender_name || senderEmail

  if (!senderEmail) return { success: false, error: 'Ingen afsender-email fundet' }

  // 3. Clean subject and extract data from body
  const cleanedSubject = cleanSubject(email.subject)
  const phone = extractPhoneNumber(email.body_text) || extractPhoneNumber(email.body_preview)

  // 4. Check for existing customer by email
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
    return { success: true, customerId: existingCustomer.id, isExisting: true, customerName: existingCustomer.company_name }
  }

  // 5. Generate customer number
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

  // 6. Create customer
  const { data: newCustomer, error: customerError } = await supabase
    .from('customers')
    .insert({
      customer_number: nextNumber,
      company_name: senderName,
      contact_person: senderName,
      email: senderEmail,
      phone: phone || null,
      tags: ['email'],
      notes: `Oprettet fra email: "${cleanedSubject}"`,
      is_active: true,
      created_by: userId,
    })
    .select('id')
    .single()

  if (customerError) {
    logger.error('Failed to create customer from email', { error: customerError })
    return { success: false, error: customerError.message }
  }

  // 7. Create lead with full email context
  const leadNotes = buildLeadNotes(
    cleanedSubject,
    email.body_text,
    email.body_preview,
    senderEmail,
    email.received_at
  )

  const { data: newLead, error: leadError } = await supabase.from('leads').insert({
    company_name: senderName,
    contact_person: senderName,
    email: senderEmail,
    phone: phone || null,
    status: 'new',
    source: 'email',
    notes: leadNotes,
    tags: ['email'],
    custom_fields: {
      source_email_id: emailId,
      source_email_subject: email.subject,
      source_email_received_at: email.received_at,
    },
    created_by: userId,
  })
    .select('id')
    .single()

  if (leadError) {
    logger.error('Failed to create lead from email', { error: leadError, metadata: { emailId } })
  }

  // 8. Copy attachments to lead folder (if any)
  if (newLead?.id && email.has_attachments) {
    try {
      await copyAttachmentsToLead(emailId, newLead.id)
    } catch (attErr) {
      logger.warn('Failed to copy attachments to lead', {
        entity: 'leads',
        entityId: newLead.id,
        error: attErr,
        metadata: { emailId },
      })
    }
  }

  // 9. Link the email
  await supabase
    .from('incoming_emails')
    .update({
      customer_id: newCustomer.id,
      link_status: 'linked',
      linked_by: 'auto-create',
    })
    .eq('id', emailId)

  logger.info('Customer + lead created from email', {
    entity: 'customers',
    entityId: newCustomer.id,
    metadata: { emailId, leadId: newLead?.id, senderEmail, phone, cleanedSubject },
  })

  revalidatePath('/dashboard/mail')
  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/leads')
  return { success: true, customerId: newCustomer.id, leadId: newLead?.id, customerName: senderName }
}

// =====================================================
// ATTACHMENT BACKFILL
// =====================================================

/**
 * Backfill attachments for an email that has has_attachments=true
 * but no stored attachment URLs (e.g. synced via force-sync script).
 */
export async function backfillEmailAttachments(
  emailId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  validateUUID(emailId, 'emailId')
  const supabase = await createClient()

  // Fetch the email to get graph_message_id
  const { data: email, error: fetchError } = await supabase
    .from('incoming_emails')
    .select('id, graph_message_id, has_attachments, attachment_urls')
    .eq('id', emailId)
    .single()

  if (fetchError || !email) {
    return { success: false, count: 0, error: 'Email ikke fundet' }
  }

  if (!email.has_attachments) {
    return { success: true, count: 0 }
  }

  // Check if already has real URLs
  const urls = email.attachment_urls as Array<{ url?: string }> | null
  if (urls && urls.length > 0 && urls.some((u) => u.url && u.url.length > 0)) {
    return { success: true, count: urls.length }
  }

  try {
    const { processEmailAttachments } = await import(
      '@/lib/services/email-attachment-storage'
    )
    const stored = await processEmailAttachments(emailId, email.graph_message_id)
    revalidatePath('/dashboard/mail')
    return { success: true, count: stored.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ukendt fejl'
    logger.error('Backfill attachments failed', {
      entity: 'incoming_emails',
      entityId: emailId,
      error: err,
    })
    return { success: false, count: 0, error: msg }
  }
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
  const mailbox = process.env.GRAPH_MAILBOX || 'ordre@eltasolar.dk'
  const { data } = await supabase
    .from('graph_sync_state')
    .select('*')
    .eq('mailbox', mailbox)
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
      mailbox: process.env.GRAPH_MAILBOX || 'ordre@eltasolar.dk',
      error: 'Microsoft Graph er ikke konfigureret. Sæt AZURE_TENANT_ID, AZURE_CLIENT_ID og AZURE_CLIENT_SECRET.',
    }
  }

  return testConn()
}
