/**
 * Email Attachment Storage Service
 *
 * Downloads attachments from Microsoft Graph and stores them in Supabase Storage.
 * Uses the existing 'attachments' bucket and 'files' table.
 *
 * Flow:
 *   1. Fetch attachment content (base64) from Graph API
 *   2. Upload to Supabase Storage (attachments bucket)
 *   3. Record in files table + update incoming_emails.attachment_urls
 */

import { createClient } from '@supabase/supabase-js'
import { fetchAttachmentContent } from '@/lib/services/microsoft-graph'
import { logger } from '@/lib/utils/logger'
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'

// =====================================================
// Service role client for storage operations
// =====================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase configuration for attachment storage')
  }
  return createClient(url, key)
}

// =====================================================
// Types
// =====================================================

export interface StoredAttachment {
  filename: string
  contentType: string
  size: number
  url: string
  storagePath: string
}

// =====================================================
// Sanitize filename for storage path
// =====================================================

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-æøåÆØÅ]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200)
}

// =====================================================
// Download & store a single attachment
// =====================================================

/**
 * Download an attachment from Graph API and upload to Supabase Storage.
 * Returns the public URL and storage path.
 */
export async function downloadAndStoreAttachment(
  emailId: string,
  graphMessageId: string,
  attachmentId: string,
  originalFilename: string
): Promise<StoredAttachment | null> {
  try {
    // 1. Fetch content from Graph API
    const attachment = await fetchAttachmentContent(graphMessageId, attachmentId)

    if (!attachment.contentBytes) {
      logger.warn('Attachment has no content bytes', {
        metadata: { emailId, attachmentId, filename: originalFilename },
      })
      return null
    }

    // 2. Decode base64 to buffer
    const buffer = Buffer.from(attachment.contentBytes, 'base64')

    // 3. Build storage path: email-attachments/{emailId}/{sanitized-filename}
    const safeName = sanitizeFilename(attachment.name || originalFilename)
    const storagePath = `email-attachments/${emailId}/${safeName}`

    // 4. Upload to Supabase Storage
    const supabase = getServiceClient()

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: attachment.contentType || 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      logger.error('Failed to upload attachment to storage', {
        entity: 'incoming_emails',
        entityId: emailId,
        error: uploadError,
        metadata: { filename: safeName, storagePath },
      })
      return null
    }

    // 5. Phase β.2.2: signed URL (1 år) i stedet for public URL.
    //    Mail-vedhaeftninger gemmes i incoming_emails.attachment_urls
    //    og bruges af UI; storagePath bevares saa consumer kan refreshe.
    const publicUrl = await getStorageSignedUrlOrNull('attachments', storagePath, SIGNED_URL_TTL.YEAR) ?? ''

    logger.info('Attachment stored', {
      entity: 'incoming_emails',
      entityId: emailId,
      metadata: {
        filename: safeName,
        size: attachment.size,
        contentType: attachment.contentType,
        storagePath,
      },
    })

    return {
      filename: attachment.name || originalFilename,
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size,
      url: publicUrl,
      storagePath,
    }
  } catch (error) {
    logger.error('Failed to download/store attachment', {
      entity: 'incoming_emails',
      entityId: emailId,
      error,
      metadata: { attachmentId, filename: originalFilename },
    })
    return null
  }
}

// =====================================================
// Process all attachments for an email
// =====================================================

/**
 * Download and store all attachments for a given email.
 * Uses $expand=attachments to fetch message + content in a single API call.
 * Updates the incoming_emails.attachment_urls column with storage URLs.
 */
export async function processEmailAttachments(
  emailId: string,
  graphMessageId: string,
  mailboxOverride?: string
): Promise<StoredAttachment[]> {
  const { fetchMessageWithAttachments } = await import('@/lib/services/microsoft-graph')

  // 1. Fetch message with attachments expanded (single API call, includes contentBytes)
  const message = await fetchMessageWithAttachments(graphMessageId, mailboxOverride)
  const attachments = message.attachments || []

  if (attachments.length === 0) return []

  // 2. Store each attachment that has content
  const stored: StoredAttachment[] = []

  for (const att of attachments) {
    if (!att.contentBytes) continue

    try {
      const buffer = Buffer.from(att.contentBytes, 'base64')
      const safeName = sanitizeFilename(att.name || 'unnamed')
      const storagePath = `email-attachments/${emailId}/${safeName}`

      const supabase = getServiceClient()

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, buffer, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: true,
        })

      if (uploadError) {
        logger.error('Failed to upload attachment', {
          entity: 'incoming_emails',
          entityId: emailId,
          error: uploadError,
          metadata: { filename: att.name },
        })
        continue
      }

      // Phase β.2.2: signed URL (1 år) i stedet for public.
      const signedUrl = await getStorageSignedUrlOrNull('attachments', storagePath, SIGNED_URL_TTL.YEAR) ?? ''

      stored.push({
        filename: att.name,
        contentType: att.contentType || 'application/octet-stream',
        size: att.size,
        url: signedUrl,
        storagePath,
      })

      logger.info('Attachment stored', {
        entity: 'incoming_emails',
        entityId: emailId,
        metadata: { filename: att.name, size: att.size, storagePath },
      })
    } catch (error) {
      logger.error('Failed to store attachment', {
        entity: 'incoming_emails',
        entityId: emailId,
        error,
        metadata: { filename: att.name },
      })
    }
  }

  // 3. Update the email record with storage URLs
  if (stored.length > 0) {
    const supabase = getServiceClient()

    const attachmentData = stored.map((s) => ({
      filename: s.filename,
      contentType: s.contentType,
      size: s.size,
      url: s.url,
      storagePath: s.storagePath,
    }))

    const { error } = await supabase
      .from('incoming_emails')
      .update({ attachment_urls: attachmentData })
      .eq('id', emailId)

    if (error) {
      logger.error('Failed to update email attachment URLs', {
        entity: 'incoming_emails',
        entityId: emailId,
        error,
      })
    }

    // Sprint 8D-1: arkivér til kundens dokumentarkiv (case-aware).
    // Læser email.customer_id + service_case_id og opretter
    // customer_documents-rows. Idempotent: skipper allerede-arkiverede
    // filer baseret på storage_path.
    await archiveAttachmentsToCustomerDocuments(emailId, stored)
  }

  logger.info('Email attachments processed', {
    entity: 'incoming_emails',
    entityId: emailId,
    metadata: {
      total: attachments.length,
      stored: stored.length,
      filenames: stored.map((s) => s.filename),
    },
  })

  return stored
}

// =====================================================
// Sprint 8D-1: Arkivér til customer_documents (case-aware)
// =====================================================

/**
 * Opretter customer_documents-rows for hver downloadet attachment.
 * Læser email.customer_id + service_case_id og kobler dokumenterne
 * dertil. Idempotent: skipper hvis storage_path allerede findes som
 * customer_documents-row.
 *
 * Forudsætter at email allerede er linked (customer_id sat). Hvis ikke,
 * skipper helt — attachment forbliver i Storage + JSONB indtil mailen
 * manuelt linkes til en kunde.
 *
 * Hvis email.service_case_id er sat, sættes det også på dokumenterne
 * → de vises pr. sag i UI. Hvis NULL, vises de som "ukoblet" på kunden.
 */
async function archiveAttachmentsToCustomerDocuments(
  emailId: string,
  stored: StoredAttachment[]
): Promise<void> {
  if (stored.length === 0) return

  const supabase = getServiceClient()

  const { data: email } = await supabase
    .from('incoming_emails')
    .select('id, customer_id, service_case_id, subject, sender_email, sender_name, received_at')
    .eq('id', emailId)
    .maybeSingle()

  if (!email) {
    logger.warn('archiveAttachmentsToCustomerDocuments: email not found', { entityId: emailId })
    return
  }

  if (!email.customer_id) {
    // Mail ikke linked — skip arkivering, brugeren kan trigge igen efter manuel link
    return
  }

  for (const att of stored) {
    try {
      // Idempotent: skip hvis dokumentet allerede er arkiveret
      const { data: existing } = await supabase
        .from('customer_documents')
        .select('id')
        .eq('storage_path', att.storagePath)
        .maybeSingle()

      if (existing) continue

      // description som JSON — samme mønster som fuldmagt-tagging i
      // customer-documents-tab.tsx. Tagger med type='email_attachment'
      // så UI-filteret kan finde dem.
      const description = JSON.stringify({
        type: 'email_attachment',
        sender_email: email.sender_email,
        sender_name: email.sender_name,
        subject: email.subject,
        received_at: email.received_at,
      })

      const subjectLabel = (email.subject || '(Intet emne)').substring(0, 80)

      const { error: insertErr } = await supabase
        .from('customer_documents')
        .insert({
          customer_id: email.customer_id,
          service_case_id: email.service_case_id || null,
          source_email_id: email.id,
          title: `${att.filename} — ${subjectLabel}`,
          description,
          document_type: 'other',
          file_url: att.url,
          storage_path: att.storagePath,
          file_name: att.filename,
          mime_type: att.contentType || 'application/octet-stream',
          file_size: att.size,
          shared_by: null,
        })

      if (insertErr) {
        logger.error('archiveAttachmentsToCustomerDocuments: insert failed', {
          entity: 'customer_documents',
          entityId: emailId,
          error: insertErr,
          metadata: {
            customer_id: email.customer_id,
            service_case_id: email.service_case_id,
            filename: att.filename,
          },
        })
      } else {
        logger.info('Email attachment archived', {
          entity: 'customer_documents',
          metadata: {
            customer_id: email.customer_id,
            service_case_id: email.service_case_id,
            email_id: email.id,
            filename: att.filename,
          },
        })
      }
    } catch (err) {
      logger.error('archiveAttachmentsToCustomerDocuments: unexpected', {
        entityId: emailId,
        error: err,
        metadata: { filename: att.filename },
      })
    }
  }
}
