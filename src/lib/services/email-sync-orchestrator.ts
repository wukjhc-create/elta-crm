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

import { createClient } from '@/lib/supabase/server'
import {
  isGraphConfigured,
  pollInboxFull,
  getMailbox,
} from '@/lib/services/microsoft-graph'
import { linkEmail } from '@/lib/services/email-linker'
import { detectAOProducts, applyKalkiaPriceUpdates } from '@/lib/services/email-ao-detector'
import { processEmailAttachments } from '@/lib/services/email-attachment-storage'
import { logger } from '@/lib/utils/logger'
import type { GraphMailMessage, EmailSyncResult } from '@/types/mail-bridge.types'

// =====================================================
// Main sync function
// =====================================================

export async function runEmailSync(): Promise<EmailSyncResult> {
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
    // Check configuration
    if (!isGraphConfigured()) {
      result.errors.push('Microsoft Graph ikke konfigureret')
      result.durationMs = Date.now() - startTime
      return result
    }

    const supabase = await createClient()
    const mailbox = getMailbox()

    // 1. Get current sync state
    const { data: syncState } = await supabase
      .from('graph_sync_state')
      .select('*')
      .eq('mailbox', mailbox)
      .maybeSingle()

    const deltaLink = syncState?.delta_link || null

    // 2. Poll Graph API
    logger.info('Starting email sync', {
      metadata: { mailbox, hasExistingDelta: !!deltaLink },
    })

    const { messages, newDeltaLink } = await pollInboxFull(deltaLink, 5)
    result.emailsFetched = messages.length

    if (messages.length === 0) {
      // No new messages — update sync state and return
      await updateSyncState(supabase, mailbox, newDeltaLink, 'success', null, 0)
      result.success = true
      result.durationMs = Date.now() - startTime
      return result
    }

    // 3. Insert emails and run pipelines
    for (const msg of messages) {
      try {
        const inserted = await insertEmail(supabase, msg, mailbox)

        if (!inserted) {
          result.emailsSkipped++
          continue
        }

        result.emailsInserted++

        // 4. Run linker
        const linkResult = await linkEmail(
          inserted.id,
          msg.from.emailAddress.address,
          msg.from.emailAddress.name || null,
          msg.subject || '(Intet emne)',
          msg.body?.content || null,
          null
        )

        if (linkResult.status === 'linked') {
          result.emailsLinked++
        }

        // 5. Run AO detection
        const aoMatches = await detectAOProducts(
          inserted.id,
          msg.subject || '',
          msg.body?.content || null,
          null
        )
        result.aoMatchesFound += aoMatches.length

        // 6. Auto-update Kalkia prices if AO matches found
        if (aoMatches.length > 0) {
          const priceResult = await applyKalkiaPriceUpdates(aoMatches)
          result.kalkiaPricesUpdated += priceResult.autoUpdatedCount
        }

        // 7. Download and store attachments
        if (msg.hasAttachments) {
          try {
            const stored = await processEmailAttachments(inserted.id, msg.id)
            result.attachmentsStored += stored.length
          } catch (attError) {
            logger.warn('Failed to process attachments', {
              entity: 'incoming_emails',
              entityId: inserted.id,
              error: attError,
            })
          }
        }
      } catch (emailError) {
        const errMsg = emailError instanceof Error ? emailError.message : 'Unknown error'
        result.errors.push(`Message ${msg.id}: ${errMsg}`)
        logger.error('Failed to process email', {
          metadata: { graphMessageId: msg.id },
          error: emailError,
        })
      }
    }

    // 7. Update sync state
    await updateSyncState(
      supabase,
      mailbox,
      newDeltaLink,
      'success',
      null,
      result.emailsInserted
    )

    result.success = true
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    result.errors.push(errMsg)
    logger.error('Email sync failed', { error })

    // Try to record failure in sync state
    try {
      const supabase = await createClient()
      await updateSyncState(supabase, getMailbox(), null, 'failed', errMsg, 0)
    } catch {
      // Ignore secondary error
    }
  }

  result.durationMs = Date.now() - startTime

  logger.info('Email sync completed', {
    metadata: {
      success: result.success,
      fetched: result.emailsFetched,
      inserted: result.emailsInserted,
      linked: result.emailsLinked,
      aoMatches: result.aoMatchesFound,
      kalkiaPricesUpdated: result.kalkiaPricesUpdated,
      errors: result.errors.length,
      durationMs: result.durationMs,
    },
  })

  return result
}

// =====================================================
// Insert a single Graph message into incoming_emails
// =====================================================

async function insertEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

  // Build attachment metadata (without downloading content)
  const attachments = (msg.attachments || []).map((a) => ({
    filename: a.name,
    contentType: a.contentType,
    size: a.size,
    url: '', // Populated on-demand if needed
  }))

  // Build body preview (first 200 chars of plain text)
  const bodyPreview = msg.bodyPreview
    ? msg.bodyPreview.substring(0, 200)
    : null

  const { data, error } = await supabase
    .from('incoming_emails')
    .insert({
      graph_message_id: msg.id,
      conversation_id: msg.conversationId || null,
      subject: msg.subject || '(Intet emne)',
      sender_email: msg.from.emailAddress.address.toLowerCase(),
      sender_name: msg.from.emailAddress.name || null,
      to_email: mailbox,
      cc: (msg.ccRecipients || []).map((r) => r.emailAddress.address),
      reply_to: msg.replyTo?.[0]?.emailAddress?.address || null,
      body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
      body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
      body_preview: bodyPreview,
      attachment_urls: attachments,
      has_attachments: msg.hasAttachments || false,
      is_read: msg.isRead || false,
      received_at: msg.receivedDateTime,
      link_status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    logger.error('Failed to insert incoming email', {
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  mailbox: string,
  newDeltaLink: string | null,
  status: string,
  error: string | null,
  emailsInserted: number
): Promise<void> {
  const updateData: Record<string, unknown> = {
    last_sync_at: new Date().toISOString(),
    last_sync_status: status,
    last_sync_error: error,
  }

  // Only update delta_link if we got a new one
  if (newDeltaLink) {
    updateData.delta_link = newDeltaLink
  }

  const { error: updateError } = await supabase
    .from('graph_sync_state')
    .update(updateData)
    .eq('mailbox', mailbox)

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

  if (updateError) {
    logger.error('Failed to update sync state', { error: updateError })
  }
}
