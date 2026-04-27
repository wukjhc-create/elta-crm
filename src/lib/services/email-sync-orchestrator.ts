/**
 * Email Sync Orchestrator
 *
 * Coordinates the full mail bridge pipeline:
 * 1. Poll Graph API for new messages
 * 2. Insert into incoming_emails table
 * 3. Run email linker (match to customers)
 * 4. Run AO product detection
 * 5. Update sync state
 *
 * Used by both the cron endpoint and manual sync trigger.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  isGraphConfigured,
  pollInboxFull,
  pollSentItems,
  getMailbox,
  getMailboxes,
  fetchMessageHeaders,
} from '@/lib/services/microsoft-graph'
import { linkEmail } from '@/lib/services/email-linker'
import { detectAOProducts, applyKalkiaPriceUpdates } from '@/lib/services/email-ao-detector'
import { processEmailAttachments } from '@/lib/services/email-attachment-storage'
import { logger } from '@/lib/utils/logger'
import type { GraphMailMessage, EmailSyncResult, MailboxSyncDetail } from '@/types/mail-bridge.types'

// =====================================================
// Main sync function
// =====================================================

export async function runEmailSync(): Promise<EmailSyncResult> {
  console.log('SYNC START — runEmailSync called')
  const startTime = Date.now()
  const result: EmailSyncResult = {
    success: false,
    emailsFetched: 0,
    emailsInserted: 0,
    emailsSkipped: 0,
    emailsLinked: 0,
    aoMatchesFound: 0,
    kalkiaPricesUpdated: 0,
    attachmentsStored: 0,
    errors: [],
    durationMs: 0,
  }

  try {
    if (!isGraphConfigured()) {
      result.errors.push('Microsoft Graph ikke konfigureret')
      result.durationMs = Date.now() - startTime
      return result
    }

    const supabase = createAdminClient()
    const mailboxes = getMailboxes()
    result.mailboxResults = []

    console.log('SYNC ALL MAILBOXES:', mailboxes.map(m => m.email))
    logger.info('Starting multi-mailbox email sync', {
      metadata: { mailboxes: mailboxes.map(m => m.email), count: mailboxes.length },
    })

    // Sync each mailbox sequentially (shared token, avoids throttling)
    for (const mb of mailboxes) {
      if (!mb.active) {
        result.mailboxResults.push({ mailbox: mb.email, fetched: 0, inserted: 0, skipped: 0, linked: 0, status: 'skipped' })
        continue
      }

      const mbDetail: MailboxSyncDetail = { mailbox: mb.email, fetched: 0, inserted: 0, skipped: 0, linked: 0, status: 'success' }

      try {
        const before = { fetched: result.emailsFetched, inserted: result.emailsInserted, skipped: result.emailsSkipped, linked: result.emailsLinked }
        await syncOneMailbox(supabase, mb.email, result)
        mbDetail.fetched = result.emailsFetched - before.fetched
        mbDetail.inserted = result.emailsInserted - before.inserted
        mbDetail.skipped = result.emailsSkipped - before.skipped
        mbDetail.linked = result.emailsLinked - before.linked

        logger.info('Mailbox sync completed', {
          metadata: { mailbox: mb.email, fetched: mbDetail.fetched, inserted: mbDetail.inserted, linked: mbDetail.linked },
        })
      } catch (mbError) {
        const errMsg = mbError instanceof Error ? mbError.message : 'Unknown error'
        result.errors.push(`${mb.email}: ${errMsg}`)
        mbDetail.status = 'failed'
        mbDetail.error = errMsg

        logger.error('Mailbox sync failed', {
          metadata: { mailbox: mb.email, error: errMsg },
          error: mbError,
        })

        // Record failure for this mailbox
        try {
          await updateSyncState(supabase, mb.email, null, 'failed', errMsg, 0)
        } catch { /* ignore */ }
      }

      result.mailboxResults.push(mbDetail)
    }

    // Success if at least one mailbox synced without errors
    const anySuccess = result.mailboxResults.some(m => m.status === 'success')
    result.success = anySuccess
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    result.errors.push(errMsg)
    logger.error('Email sync failed', { error })
  }

  result.durationMs = Date.now() - startTime

  logger.info('Email sync completed', {
    metadata: {
      success: result.success,
      fetched: result.emailsFetched,
      inserted: result.emailsInserted,
      linked: result.emailsLinked,
      aoMatches: result.aoMatchesFound,
      errors: result.errors.length,
      durationMs: result.durationMs,
    },
  })

  return result
}

// =====================================================
// Sync a single mailbox (inbox + sent items)
// =====================================================

async function syncOneMailbox(
  supabase: ReturnType<typeof createAdminClient>,
  mailbox: string,
  result: EmailSyncResult
): Promise<void> {
  // 1. Get sync state for this specific mailbox
  const { data: syncState } = await supabase
    .from('graph_sync_state')
    .select('*')
    .eq('mailbox', mailbox)
    .maybeSingle()

  const deltaLink = syncState?.delta_link || null

  console.log('SYNC MAILBOX:', mailbox)
  logger.info('Syncing mailbox', {
    metadata: { mailbox, hasExistingDelta: !!deltaLink, deltaLinkPreview: deltaLink ? deltaLink.substring(0, 120) : null },
  })

  // 2. Poll inbox — explicit mailbox override, no fallback
  // If delta link fails (e.g. SyncStateNotFound) → retry without it (full sync)
  // 20 pages × 50 = up to 1000 messages per sync run. Combined with the
  // continuation-token fix in pollInboxFull, larger inboxes finish their
  // initial backfill across a few syncs instead of looping forever on the
  // first 250 messages.
  const MAX_PAGES = 20
  let pollResult: { messages: GraphMailMessage[]; newDeltaLink: string | null }
  try {
    pollResult = await pollInboxFull(deltaLink, MAX_PAGES, mailbox)
  } catch (pollError: unknown) {
    const errMsg = pollError instanceof Error ? pollError.message : ''
    if (errMsg.includes('SyncStateNotFound') || errMsg.includes('syncStateNotFound') || errMsg.includes('ResyncRequired')) {
      console.warn('Delta invalid → resetting sync for mailbox:', mailbox)
      logger.warn('Delta link invalid, retrying full sync', { metadata: { mailbox, error: errMsg } })
      // Clear stale delta in DB
      await supabase.from('graph_sync_state').update({ delta_link: null }).eq('mailbox', mailbox)
      pollResult = await pollInboxFull(null, MAX_PAGES, mailbox)
    } else {
      throw pollError
    }
  }
  const { messages, newDeltaLink } = pollResult
  result.emailsFetched += messages.length
  console.log('MESSAGES LENGTH:', messages.length, 'mailbox:', mailbox)

  // 3. Process inbox messages — insert every single one
  let mailboxInserted = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Delta can return "@removed" markers with no from/subject — skip those
    if (!msg.from?.emailAddress?.address) {
      console.log('SKIP REMOVED MARKER:', i, msg.id)
      result.emailsSkipped++
      continue
    }

    const subject = msg.subject || '(Intet emne)'
    const senderEmail = msg.from.emailAddress.address.toLowerCase()
    console.log('PROCESSING EMAIL:', i + 1, '/', messages.length, subject, 'from:', senderEmail)

    // Insert directly — no separate function call that could silently fail
    const insertPayload: Record<string, unknown> = {
      graph_message_id: msg.id,
      conversation_id: msg.conversationId || null,
      mailbox_source: mailbox,
      subject,
      sender_email: senderEmail,
      sender_name: msg.from.emailAddress.name || null,
      to_email: mailbox,
      cc: (msg.ccRecipients || []).map((r) => r.emailAddress.address),
      reply_to: msg.replyTo?.[0]?.emailAddress?.address || null,
      body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
      body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
      body_preview: msg.bodyPreview ? msg.bodyPreview.substring(0, 200) : null,
      attachment_urls: (msg.attachments || []).map((a) => ({ filename: a.name, contentType: a.contentType, size: a.size, url: '' })),
      has_attachments: msg.hasAttachments || false,
      is_read: msg.isRead || false,
      received_at: msg.receivedDateTime,
      link_status: 'pending',
    }
    if (msg.internetMessageId) insertPayload.internet_message_id = msg.internetMessageId

    let { data: inserted, error: insertError } = await supabase
      .from('incoming_emails')
      .upsert(insertPayload, { onConflict: 'graph_message_id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()

    // Retry without new columns if migrations 00070/00071 aren't applied or
    // PostgREST schema cache is stale (PGRST204 / 42703).
    const isMissingColumnError = !!insertError && (
      insertError.code === 'PGRST204' ||
      insertError.code === '42703' ||
      insertError.message?.includes('internet_message_id') ||
      insertError.message?.includes('mailbox_source')
    )
    if (isMissingColumnError) {
      console.log('RETRY UPSERT without new columns:', subject, 'code:', insertError?.code)
      delete insertPayload.internet_message_id
      delete insertPayload.mailbox_source
      const retry = await supabase
        .from('incoming_emails')
        .upsert(insertPayload, { onConflict: 'graph_message_id', ignoreDuplicates: true })
        .select('id')
        .maybeSingle()
      inserted = retry.data
      insertError = retry.error
    }

    if (insertError) {
      console.error('UPSERT FAILED:', subject, 'error:', insertError.message, 'code:', insertError.code, 'details:', insertError.details)
      result.errors.push(`${mailbox}: upsert failed: ${insertError.message}`)
      continue
    }

    // ignoreDuplicates: rows that already exist return null. Look them up so we
    // can still run the linker and report a stable count.
    if (!inserted) {
      const { data: existing } = await supabase
        .from('incoming_emails')
        .select('id')
        .eq('graph_message_id', msg.id)
        .maybeSingle()
      if (existing) {
        console.log('DUPLICATE SKIP:', subject, 'id:', existing.id)
        result.emailsSkipped++
        continue
      }
      // Truly nothing returned → treat as failure so it shows up in errors
      console.error('UPSERT NO ROW:', subject)
      result.errors.push(`${mailbox}: upsert returned no row for ${subject}`)
      continue
    }

    console.log('INSERT OK:', subject, 'id:', inserted.id)
    result.emailsInserted++
    mailboxInserted++

    // Link to customer (non-critical — wrapped in try/catch)
    if (inserted?.id) {
      try {
        const linkResult = await linkEmail(
          inserted.id,
          senderEmail,
          msg.from.emailAddress.name || null,
          subject,
          msg.body?.content || null,
          null
        )
        if (linkResult.status === 'linked') result.emailsLinked++
      } catch (linkErr) {
        console.warn('LINK FAILED:', subject, linkErr instanceof Error ? linkErr.message : '')
      }
    }
  }

  // 4. Sync sent items for this mailbox
  try {
    const sinceDateTime = syncState?.last_sync_at || null
    const sentMessages = await pollSentItems(sinceDateTime, 25, mailbox)

    for (const msg of sentMessages) {
      try {
        const inserted = await insertSentEmail(supabase, msg, mailbox)
        if (inserted) {
          result.emailsInserted++
          mailboxInserted++
          const toAddresses = (msg.toRecipients || []).map(r => r.emailAddress.address.toLowerCase())
          for (const toAddr of toAddresses) {
            const lr = await linkEmail(inserted.id, toAddr, null, msg.subject || '(Intet emne)', msg.body?.content || null, null)
            if (lr.status === 'linked') result.emailsLinked++
          }
        }
      } catch (sentError) {
        logger.warn('Failed to process sent email', { metadata: { graphMessageId: msg.id, mailbox }, error: sentError })
      }
    }
  } catch (sentSyncError) {
    logger.warn('Sent items sync failed for mailbox', { metadata: { mailbox }, error: sentSyncError })
  }

  // 5. Always store new delta link after successful sync
  if (newDeltaLink) {
    await supabase
      .from('graph_sync_state')
      .upsert({
        mailbox,
        delta_link: newDeltaLink,
        last_sync_status: 'success',
        last_sync_error: null,
        last_sync_at: new Date().toISOString(),
      }, { onConflict: 'mailbox' })
  } else {
    await updateSyncState(supabase, mailbox, null, 'success', null, mailboxInserted)
  }
}

// =====================================================
// Insert a single Graph message into incoming_emails
// =====================================================

async function insertEmail(
  supabase: ReturnType<typeof createAdminClient>,
  msg: GraphMailMessage,
  mailbox: string
): Promise<{ id: string } | null> {
  const subject = msg.subject || '(Intet emne)'
  const senderEmail = msg.from?.emailAddress?.address?.toLowerCase() || 'unknown'

  console.log('INSERT EMAIL:', subject, 'from:', senderEmail, 'mailbox:', mailbox)

  // Upsert by graph_message_id — if it exists, skip silently; if not, insert
  const insertPayload: Record<string, unknown> = {
    graph_message_id: msg.id,
    conversation_id: msg.conversationId || null,
    subject,
    sender_email: senderEmail,
    sender_name: msg.from?.emailAddress?.name || null,
    to_email: mailbox,
    cc: (msg.ccRecipients || []).map((r) => r.emailAddress.address),
    reply_to: msg.replyTo?.[0]?.emailAddress?.address || null,
    body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
    body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
    body_preview: msg.bodyPreview ? msg.bodyPreview.substring(0, 200) : null,
    attachment_urls: (msg.attachments || []).map((a) => ({ filename: a.name, contentType: a.contentType, size: a.size, url: '' })),
    has_attachments: msg.hasAttachments || false,
    is_read: msg.isRead || false,
    received_at: msg.receivedDateTime,
    link_status: 'pending',
    mailbox_source: mailbox,
  }

  if (msg.internetMessageId) insertPayload.internet_message_id = msg.internetMessageId

  // Try insert
  let { data, error } = await supabase
    .from('incoming_emails')
    .insert(insertPayload)
    .select('id')
    .single()

  // If column doesn't exist yet → retry without new columns
  if (error && (error.message?.includes('internet_message_id') || error.message?.includes('mailbox_source'))) {
    console.log('INSERT RETRY without new columns for:', subject)
    delete insertPayload.internet_message_id
    delete insertPayload.mailbox_source
    const retry = await supabase.from('incoming_emails').insert(insertPayload).select('id').single()
    data = retry.data
    error = retry.error
  }

  // If duplicate (graph_message_id unique constraint) → not an error, just skip
  if (error && (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique'))) {
    console.log('INSERT SKIP (duplicate):', subject)
    return null
  }

  if (error) {
    console.error('INSERT FAILED:', subject, 'error:', error.message, 'code:', error.code, 'details:', error.details)
    return null
  }

  console.log('INSERT OK:', subject, 'id:', data?.id)
  return data
}

// =====================================================
// Insert a sent email into incoming_emails (outgoing)
// =====================================================

async function insertSentEmail(
  supabase: ReturnType<typeof createAdminClient>,
  msg: GraphMailMessage,
  mailbox: string
): Promise<{ id: string } | null> {
  // Dedup check
  const { data: existing } = await supabase
    .from('incoming_emails')
    .select('id')
    .eq('graph_message_id', msg.id)
    .maybeSingle()

  if (existing) {
    return null // Already imported
  }

  const toRecipients = (msg.toRecipients || []).map(r => r.emailAddress.address.toLowerCase())
  const toEmail = toRecipients[0] || null

  const bodyPreview = msg.bodyPreview
    ? msg.bodyPreview.substring(0, 200)
    : null

  const sentPayload: Record<string, unknown> = {
    graph_message_id: msg.id,
    conversation_id: msg.conversationId || null,
    mailbox_source: mailbox,
    subject: msg.subject || '(Intet emne)',
    sender_email: mailbox,
    sender_name: msg.from?.emailAddress?.name || 'Elta Solar',
    to_email: toEmail,
    cc: (msg.ccRecipients || []).map(r => r.emailAddress.address),
    body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
    body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
    body_preview: bodyPreview,
    has_attachments: msg.hasAttachments || false,
    is_read: true,
    received_at: msg.receivedDateTime,
    link_status: 'pending',
    processed_at: new Date().toISOString(),
  }
  if (msg.internetMessageId) sentPayload.internet_message_id = msg.internetMessageId

  let { data, error } = await supabase
    .from('incoming_emails')
    .insert(sentPayload)
    .select('id')
    .single()

  // Retry without new columns if they don't exist yet
  if (error && (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    error.message?.includes('internet_message_id') ||
    error.message?.includes('mailbox_source')
  )) {
    delete sentPayload.internet_message_id
    delete sentPayload.mailbox_source
    const retry = await supabase.from('incoming_emails').insert(sentPayload).select('id').single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    logger.error('Failed to insert sent email', {
      metadata: { graphMessageId: msg.id },
      error,
    })
    return null
  }

  return data
}

// =====================================================
// Sync state management
// =====================================================

async function updateSyncState(
  supabase: ReturnType<typeof createAdminClient>,
  mailbox: string,
  newDeltaLink: string | null,
  status: string,
  error: string | null,
  emailsInserted: number
): Promise<void> {
  const now = new Date().toISOString()

  // Upsert: creates the row if this is a new mailbox (e.g. switching from crm@ to ordre@)
  const upsertData: Record<string, unknown> = {
    mailbox,
    last_sync_at: now,
    last_sync_status: status,
    last_sync_error: error,
  }

  if (newDeltaLink) {
    upsertData.delta_link = newDeltaLink
  }

  const { error: upsertError } = await supabase
    .from('graph_sync_state')
    .upsert(upsertData, { onConflict: 'mailbox' })

  // Also increment total counter
  if (emailsInserted > 0) {
    const { error: rpcError } = await supabase.rpc('increment_counter', {
      table_name: 'graph_sync_state',
      column_name: 'emails_synced_total',
      increment_by: emailsInserted,
      row_mailbox: mailbox,
    })

    if (rpcError) {
      // Fallback: read-then-write (acceptable for sync state)
      const { data } = await supabase
        .from('graph_sync_state')
        .select('emails_synced_total')
        .eq('mailbox', mailbox)
        .maybeSingle()

      if (data) {
        await supabase
          .from('graph_sync_state')
          .update({ emails_synced_total: (data.emails_synced_total || 0) + emailsInserted })
          .eq('mailbox', mailbox)
      }
    }
  }

  if (upsertError) {
    logger.error('Failed to update sync state', { error: upsertError })
  }
}
