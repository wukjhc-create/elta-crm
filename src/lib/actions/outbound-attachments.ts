'use server'

/**
 * Sprint 8F — Server actions for outbound mail attachments.
 *
 * Bruges af attachment-picker (klient-komponent) til at uploade filer
 * FØR mailen sendes. Returnerer customer_documents-IDs som derefter
 * passes som `attachmentIds` til sendQuickReply / sendTaskEmail.
 *
 * AI / mail-flow KALDER ALDRIG dette direkte — det er brugerens valg
 * at vedhæfte filer. Mennesket trykker fortsat Send.
 */

import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import {
  uploadOutboundAttachment,
  validateOutboundAttachment,
  validateOutboundAttachmentBatch,
  cleanupOutboundAttachments,
  type UploadedOutboundAttachment,
} from '@/lib/services/outbound-attachments'

export interface UploadAttachmentsResult {
  success: boolean
  attachments?: UploadedOutboundAttachment[]
  error?: string
}

/**
 * Modtag FormData med filer, validér, upload til Storage + opret
 * customer_documents-rows. Returnerer ID-liste til klient.
 *
 * Forventede FormData-felter:
 * - customerId: string (UUID)
 * - serviceCaseId?: string (UUID — valgfri)
 * - files: File[] (browser File-objects)
 */
export async function uploadOutboundAttachmentsAction(
  formData: FormData
): Promise<UploadAttachmentsResult> {
  let userId: string | null = null
  try {
    const auth = await getAuthenticatedClient()
    userId = auth.userId
  } catch {
    return { success: false, error: 'Ikke logget ind' }
  }

  const customerId = formData.get('customerId') as string | null
  const serviceCaseId = (formData.get('serviceCaseId') as string | null) || null

  if (!customerId) {
    return { success: false, error: 'customerId mangler' }
  }
  try {
    validateUUID(customerId, 'customerId')
    if (serviceCaseId) validateUUID(serviceCaseId, 'serviceCaseId')
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Ugyldigt UUID' }
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return { success: false, error: 'Ingen filer modtaget' }
  }

  // Batch-validering — afvis hvis nogen fil bryder reglerne
  const validation = validateOutboundAttachmentBatch(
    files.map((f) => ({ filename: f.name, size: f.size, mimeType: f.type }))
  )
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  // Per-fil upload. Hvis NOGEN fejler, ryd op i de allerede uploadede.
  const uploaded: UploadedOutboundAttachment[] = []
  try {
    for (const f of files) {
      // Re-validér per fil (defense in depth)
      const v = validateOutboundAttachment({
        filename: f.name,
        size: f.size,
        mimeType: f.type,
      })
      if (!v.ok) {
        throw new Error(v.error || 'Ugyldig fil')
      }

      const buffer = Buffer.from(await f.arrayBuffer())
      const result = await uploadOutboundAttachment({
        customerId,
        serviceCaseId,
        filename: f.name,
        mimeType: f.type,
        buffer,
        uploadedBy: userId,
      })
      uploaded.push(result)
    }

    logger.info('Outbound attachments uploaded', {
      userId: userId || undefined,
      metadata: {
        customerId,
        serviceCaseId,
        count: uploaded.length,
        totalBytes: uploaded.reduce((s, a) => s + a.size, 0),
      },
    })

    return { success: true, attachments: uploaded }
  } catch (err) {
    // Cleanup already-uploaded so vi ikke efterlader rester
    if (uploaded.length > 0) {
      await cleanupOutboundAttachments(uploaded.map((a) => a.document_id))
    }
    const msg = err instanceof Error ? err.message : 'Upload fejlede'
    logger.warn('Outbound attachment upload failed', {
      userId: userId || undefined,
      metadata: { customerId, serviceCaseId, error: msg },
    })
    return { success: false, error: msg }
  }
}

/**
 * Manuelt slet en outbound-vedhæftning (fx brugeren fortryder).
 * Sletter Storage-fil + customer_documents-row.
 */
export async function deleteOutboundAttachmentAction(
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    validateUUID(documentId, 'documentId')
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Ugyldigt UUID' }
  }

  try {
    await cleanupOutboundAttachments([documentId])
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Sletning fejlede' }
  }
}
