/**
 * Sprint 8F — Outbound mail attachment service.
 *
 * Helpers til at sanitere filnavne, validere MIME-type/extension/størrelse,
 * uploade en outbound-vedhæftning til Supabase Storage + customer_documents,
 * og preparere Buffer-array til Microsoft Graph sendMail.
 *
 * NO 'use server' — denne fil eksporterer både sync helpers og async
 * Supabase-kald. Server-actions (med 'use server') ligger i
 * src/lib/actions/outbound-attachments.ts og kalder denne service.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'

// =====================================================
// Constants
// =====================================================

/** Max raw file size per attachment (3 MB).
 *  Microsoft Graph sendMail har 4 MB total payload-grænse efter base64. */
export const MAX_OUTBOUND_FILE_BYTES = 3 * 1024 * 1024

/** Max total raw bytes across all attachments (4 MB).
 *  Tæt på Graph-grænsen efter base64 + JSON body, men matcher pilotspec. */
export const MAX_OUTBOUND_TOTAL_BYTES = 4 * 1024 * 1024

/** Max antal filer pr. outbound mail. */
export const MAX_OUTBOUND_FILES = 5

/** Allowed MIME types — strict allowlist. */
export const ALLOWED_OUTBOUND_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

/** Allowed file extensions (lowercase, uden punktum). */
export const ALLOWED_OUTBOUND_EXTENSIONS = new Set<string>([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif',
  'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv',
])

/** Eksplicit blokerede extensions — afvises selvom MIME-type ser legitim ud. */
export const BLOCKED_OUTBOUND_EXTENSIONS = new Set<string>([
  'exe', 'js', 'bat', 'cmd', 'ps1', 'scr', 'zip', 'rar', '7z',
  'msi', 'dll', 'com', 'vbs', 'jar', 'sh', 'app', 'apk',
])

const BUCKET = 'attachments'
const STORAGE_PREFIX = 'outbound-attachments'

// =====================================================
// Filename sanitization
// =====================================================

/**
 * Sanitér et brugerleveret filnavn til sikker brug i Storage path og
 * i mail-attachment "name"-felt.
 * - Strip path separators ('/', '\\')
 * - Strip control chars
 * - Erstat ikke-alfanum/dot/dash/underscore med '_'
 * - Clamp længde til 200 tegn
 */
export function sanitizeFilename(input: string): string {
  if (!input) return 'fil'
  const stripped = input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
  const sanitized = stripped.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim()
  const clamped = sanitized.substring(0, 200)
  return clamped || 'fil'
}

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase()
  const idx = lower.lastIndexOf('.')
  return idx >= 0 && idx < lower.length - 1 ? lower.substring(idx + 1) : ''
}

// =====================================================
// Validation
// =====================================================

export interface AttachmentValidationInput {
  filename: string
  size: number
  mimeType: string
}

export interface AttachmentValidationResult {
  ok: boolean
  error?: string
}

/**
 * Validér en outbound-vedhæftning. Returnerer ok/error — bruges både
 * client-side (UX-feedback) og server-side (security).
 */
export function validateOutboundAttachment(
  input: AttachmentValidationInput
): AttachmentValidationResult {
  if (!input.filename || input.filename.trim().length === 0) {
    return { ok: false, error: 'Filnavn mangler' }
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: 'Ugyldig filstørrelse' }
  }
  if (input.size > MAX_OUTBOUND_FILE_BYTES) {
    return {
      ok: false,
      error: `Filen er for stor (max ${Math.round(MAX_OUTBOUND_FILE_BYTES / 1024 / 1024)} MB pr. fil)`,
    }
  }

  const ext = extensionOf(input.filename)
  if (BLOCKED_OUTBOUND_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Filtypen .${ext} er blokeret af sikkerhedshensyn` }
  }
  if (!ALLOWED_OUTBOUND_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Filtypen .${ext || '(ukendt)'} er ikke tilladt` }
  }

  const mime = (input.mimeType || '').toLowerCase()
  if (!ALLOWED_OUTBOUND_MIME_TYPES.has(mime)) {
    return { ok: false, error: `MIME-typen ${mime || '(ukendt)'} er ikke tilladt` }
  }

  return { ok: true }
}

/**
 * Validér en samlet liste — checker både per-fil og total + antal.
 */
export function validateOutboundAttachmentBatch(
  files: AttachmentValidationInput[]
): AttachmentValidationResult {
  if (files.length > MAX_OUTBOUND_FILES) {
    return { ok: false, error: `Maksimalt ${MAX_OUTBOUND_FILES} filer pr. mail` }
  }
  let total = 0
  for (const f of files) {
    const r = validateOutboundAttachment(f)
    if (!r.ok) return r
    total += f.size
  }
  if (total > MAX_OUTBOUND_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Samlet størrelse overskrider ${Math.round(MAX_OUTBOUND_TOTAL_BYTES / 1024 / 1024)} MB`,
    }
  }
  return { ok: true }
}

// =====================================================
// Upload
// =====================================================

export interface UploadOutboundAttachmentInput {
  customerId: string
  serviceCaseId?: string | null
  filename: string
  mimeType: string
  buffer: Buffer
  uploadedBy?: string | null
}

export interface UploadedOutboundAttachment {
  document_id: string
  storage_path: string
  file_url: string
  file_name: string
  mime_type: string
  size: number
}

/**
 * Upload én outbound-vedhæftning til Storage + opret customer_documents row.
 * Caller har ansvar for at validere FØR kald.
 *
 * Path: outbound-attachments/{customerId}/{timestamp}-{sanitizedName}
 * Document type: 'other' (med description JSON-tag for outbound-attachment).
 */
export async function uploadOutboundAttachment(
  input: UploadOutboundAttachmentInput
): Promise<UploadedOutboundAttachment> {
  const supabase = createAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ikke konfigureret')
  }

  const sanitized = sanitizeFilename(input.filename)
  const ts = Date.now()
  const storagePath = `${STORAGE_PREFIX}/${input.customerId}/${ts}-${sanitized}`

  // 1. Upload til Storage
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.buffer, {
      contentType: input.mimeType,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadErr) {
    logger.error('outbound-attachment upload failed', {
      error: uploadErr,
      metadata: { customerId: input.customerId, filename: sanitized },
    })
    throw new Error(`Upload fejlede: ${uploadErr.message}`)
  }

  // Phase β.2.2: signed URL (1 år) i stedet for manuelt konstrueret
  // /object/public/ URL. Sidstnaevnte virker IKKE efter bucket-
  // privatisering. storage_path bevares i row saa consumer kan refreshe.
  const fileUrl = await getStorageSignedUrlOrNull(BUCKET, storagePath, SIGNED_URL_TTL.YEAR) ?? ''

  // 2. Opret customer_documents row
  const description = JSON.stringify({
    type: 'outbound_attachment',
    uploaded_at: new Date().toISOString(),
  })

  const { data: doc, error: docErr } = await supabase
    .from('customer_documents')
    .insert({
      customer_id: input.customerId,
      service_case_id: input.serviceCaseId || null,
      title: sanitized,
      description,
      document_type: 'other',
      file_url: fileUrl,
      storage_path: storagePath,
      file_name: sanitized,
      mime_type: input.mimeType,
      file_size: input.buffer.length,
      shared_by: input.uploadedBy || null,
    })
    .select('id')
    .single()

  if (docErr || !doc) {
    // Rul Storage-upload tilbage hvis customer_documents-insert fejler
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => null)
    logger.error('outbound-attachment customer_documents insert failed', {
      error: docErr,
      metadata: { customerId: input.customerId, storagePath },
    })
    throw new Error(`Kunne ikke registrere dokument: ${docErr?.message || 'ukendt'}`)
  }

  return {
    document_id: doc.id as string,
    storage_path: storagePath,
    file_url: fileUrl,
    file_name: sanitized,
    mime_type: input.mimeType,
    size: input.buffer.length,
  }
}

// =====================================================
// Prepare Graph attachments
// =====================================================

export interface PreparedGraphAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface PreparedAttachmentsResult {
  ok: boolean
  attachments: PreparedGraphAttachment[]
  /** Metadata til outbound mirror's attachment_urls field */
  metadata: Array<{
    filename: string
    contentType: string
    size: number
    url: string
    storagePath: string
  }>
  error?: string
}

/**
 * Hent customer_documents-rows via IDs, download fil-content fra Storage,
 * og returnér Buffer-array klar til Graph sendMail.
 *
 * Validerer at alle dokumenter tilhører den samme customer (sikkerhed).
 */
export async function prepareGraphAttachmentsFromDocumentIds(
  documentIds: string[],
  customerId: string
): Promise<PreparedAttachmentsResult> {
  if (!documentIds || documentIds.length === 0) {
    return { ok: true, attachments: [], metadata: [] }
  }
  if (documentIds.length > MAX_OUTBOUND_FILES) {
    return {
      ok: false,
      attachments: [],
      metadata: [],
      error: `Maksimalt ${MAX_OUTBOUND_FILES} filer pr. mail`,
    }
  }

  const supabase = createAdminClient()

  const { data: docs, error } = await supabase
    .from('customer_documents')
    .select('id, customer_id, file_name, storage_path, file_url, mime_type, file_size')
    .in('id', documentIds)

  if (error) {
    logger.error('prepareGraphAttachments fetch failed', { error })
    return { ok: false, attachments: [], metadata: [], error: 'Kunne ikke hente dokumenter' }
  }
  if (!docs || docs.length === 0) {
    return { ok: false, attachments: [], metadata: [], error: 'Ingen vedhæftninger fundet' }
  }
  if (docs.length !== documentIds.length) {
    return { ok: false, attachments: [], metadata: [], error: 'Nogle vedhæftninger blev ikke fundet' }
  }

  // Sikkerhed: alle dokumenter skal tilhøre samme kunde som mailen
  const otherCustomer = docs.find((d) => d.customer_id !== customerId)
  if (otherCustomer) {
    logger.warn('prepareGraphAttachments customer mismatch', {
      metadata: { expected: customerId, got: otherCustomer.customer_id },
    })
    return { ok: false, attachments: [], metadata: [], error: 'Vedhæftning tilhører anden kunde' }
  }

  // Total-size check
  const total = docs.reduce((s, d) => s + (d.file_size || 0), 0)
  if (total > MAX_OUTBOUND_TOTAL_BYTES) {
    return {
      ok: false,
      attachments: [],
      metadata: [],
      error: `Samlet størrelse overskrider ${Math.round(MAX_OUTBOUND_TOTAL_BYTES / 1024 / 1024)} MB`,
    }
  }

  // Download hver fil fra Storage
  const attachments: PreparedGraphAttachment[] = []
  const metadata: PreparedAttachmentsResult['metadata'] = []

  for (const d of docs) {
    if (!d.storage_path) {
      return {
        ok: false,
        attachments: [],
        metadata: [],
        error: `Storage-sti mangler for ${d.file_name}`,
      }
    }
    const { data: fileData, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(d.storage_path)

    if (dlErr || !fileData) {
      logger.warn('prepareGraphAttachments download failed', {
        metadata: { storagePath: d.storage_path, err: dlErr?.message },
      })
      return {
        ok: false,
        attachments: [],
        metadata: [],
        error: `Kunne ikke læse fil: ${d.file_name}`,
      }
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())

    // Re-validér efter download (defense in depth)
    const v = validateOutboundAttachment({
      filename: d.file_name,
      size: buffer.length,
      mimeType: d.mime_type,
    })
    if (!v.ok) {
      return { ok: false, attachments: [], metadata: [], error: v.error }
    }

    attachments.push({
      filename: d.file_name,
      content: buffer,
      contentType: d.mime_type,
    })

    metadata.push({
      filename: d.file_name,
      contentType: d.mime_type,
      size: buffer.length,
      url: d.file_url,
      storagePath: d.storage_path,
    })
  }

  return { ok: true, attachments, metadata }
}

// =====================================================
// Cleanup (best-effort)
// =====================================================

/**
 * Best-effort cleanup når Graph send fejler EFTER upload:
 * sletter customer_documents-rows OG Storage-filer for de
 * uploaded IDs. Logger fejl, throw'er aldrig.
 */
export async function cleanupOutboundAttachments(
  documentIds: string[]
): Promise<void> {
  if (!documentIds || documentIds.length === 0) return
  const supabase = createAdminClient()

  // Hent storage_paths før vi sletter rows
  const { data: docs } = await supabase
    .from('customer_documents')
    .select('id, storage_path')
    .in('id', documentIds)

  const paths = (docs || [])
    .map((d) => d.storage_path as string | null)
    .filter((p): p is string => !!p)

  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths).catch((err) => {
      logger.warn('cleanupOutboundAttachments storage remove failed', { error: err })
    })
  }

  await supabase
    .from('customer_documents')
    .delete()
    .in('id', documentIds)
    .then((res) => {
      if (res.error) {
        logger.warn('cleanupOutboundAttachments db delete failed', {
          error: res.error,
        })
      }
    })
}
