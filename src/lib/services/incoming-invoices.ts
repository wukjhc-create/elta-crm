/**
 * Incoming supplier invoice orchestrator (Phase 15).
 *
 * Public surface:
 *   - ingestFromEmail(emailId)        — inspects an incoming_emails row,
 *                                       creates one incoming_invoices row
 *                                       per PDF/HTML attachment that looks
 *                                       like an invoice, runs parse + match.
 *   - ingestFromUpload(...)           — direct upload (for the future UI).
 *   - parseAndMatch(invoiceId)        — runs parser + matcher + state flip.
 *   - approveInvoice(id, approverId)  — gate, transition to approved + push
 *                                       to e-conomic (skip-safe).
 *   - rejectInvoice(id, rejId, reason)
 *   - getApprovalQueue()              — for the future UI.
 *
 * Every state change emits an audit row in incoming_invoice_audit_log.
 * Pure server module — no UI yet.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import {
  parseSupplierInvoiceText,
} from '@/lib/services/incoming-invoice-parser'
import {
  matchSupplierInvoice,
} from '@/lib/services/incoming-invoice-matcher'
import type {
  IncomingInvoiceRow,
  IngestEmailResult,
} from '@/types/incoming-invoices.types'

// =====================================================
// Audit
// =====================================================

interface AuditInput {
  incomingInvoiceId: string
  action: string
  actorId?: string | null
  previousValue?: unknown
  newValue?: unknown
  ok?: boolean
  message?: string
}

async function auditLog(input: AuditInput): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('incoming_invoice_audit_log').insert({
      incoming_invoice_id: input.incomingInvoiceId,
      action: input.action,
      actor_id: input.actorId ?? null,
      previous_value: input.previousValue ?? null,
      new_value: input.newValue ?? null,
      ok: input.ok ?? true,
      message: input.message ?? null,
    })
  } catch (err) {
    logger.warn('incoming_invoice_audit_log insert failed', { error: err })
  }
}

// =====================================================
// Email ingest
// =====================================================

/**
 * Treat an attachment as a probable invoice if its mime is PDF, or its
 * filename contains "faktura" / "invoice".
 */
function isLikelyInvoiceAttachment(att: { name?: string; mime?: string; url?: string }): boolean {
  const name = (att.name || att.url || '').toLowerCase()
  const mime = (att.mime || '').toLowerCase()
  if (mime.includes('pdf')) return true
  if (/\.(pdf|xml)$/i.test(name)) return true
  if (/(faktura|invoice|kreditnota|credit\s*note)/i.test(name)) return true
  return false
}

interface EmailAttachment {
  url?: string
  name?: string
  mime?: string
  size?: number
}

export async function ingestFromEmail(emailId: string): Promise<IngestEmailResult> {
  const result: IngestEmailResult = { ingested: 0, duplicates: 0, errors: [], invoiceIds: [] }
  const supabase = createAdminClient()

  const { data: email, error: readErr } = await supabase
    .from('incoming_emails')
    .select('id, sender_email, sender_name, subject, body_text, body_preview, attachment_urls, has_attachments')
    .eq('id', emailId)
    .maybeSingle()
  if (readErr || !email) {
    result.errors.push(`email ${emailId} not found`)
    return result
  }

  const attachments: EmailAttachment[] = parseAttachments(email.attachment_urls)
  const candidates = attachments.filter(isLikelyInvoiceAttachment)

  // No attachments: still ingest the email body as a single record (some
  // suppliers email plain-text invoices). Skip if body is tiny.
  if (candidates.length === 0) {
    const body = (email.body_text || email.body_preview || '').trim()
    if (body.length < 200) return result
    candidates.push({ name: `email-${emailId}.txt`, mime: 'text/plain' })
  }

  for (const att of candidates) {
    try {
      const rawText = await fetchAttachmentText(att, email.body_text || email.body_preview || '')
      const fileHash = rawText ? sha256(rawText) : null

      // Hard-dedup on file hash — UNIQUE index on file_hash blocks the row;
      // we pre-check to log it as a duplicate cleanly.
      if (fileHash) {
        const { data: dup } = await supabase
          .from('incoming_invoices')
          .select('id')
          .eq('file_hash', fileHash)
          .limit(1)
          .maybeSingle()
        if (dup) {
          result.duplicates++
          continue
        }
      }

      const { data: ins, error } = await supabase
        .from('incoming_invoices')
        .insert({
          source: 'email',
          source_email_id: emailId,
          file_url: att.url ?? null,
          file_name: att.name ?? null,
          file_size_bytes: att.size ?? null,
          mime_type: att.mime ?? null,
          file_hash: fileHash,
          raw_text: rawText,
          supplier_name_extracted: email.sender_name ?? null,
          status: 'received',
          parse_status: 'pending',
        })
        .select('id')
        .single()

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          result.duplicates++
          continue
        }
        result.errors.push(`${att.name ?? 'attachment'}: ${error.message}`)
        continue
      }

      const invoiceId = ins!.id
      result.ingested++
      result.invoiceIds.push(invoiceId)
      await auditLog({
        incomingInvoiceId: invoiceId,
        action: 'ingested',
        message: `from email ${emailId} attachment ${att.name ?? '(body)'}`,
        newValue: { source: 'email', file_name: att.name ?? null },
      })

      // Run parse + match immediately.
      try {
        await parseAndMatch(invoiceId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await auditLog({ incomingInvoiceId: invoiceId, action: 'error', ok: false, message: msg })
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  console.log('INCOMING INVOICE EMAIL INGEST:', emailId, 'ingested=' + result.ingested, 'dup=' + result.duplicates, 'err=' + result.errors.length)
  return result
}

function parseAttachments(raw: unknown): EmailAttachment[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((r): EmailAttachment => {
      if (typeof r === 'string') return { url: r, name: r.split('/').pop() ?? r }
      const o = r as Record<string, unknown>
      return {
        url: typeof o.url === 'string' ? o.url : undefined,
        name: typeof o.name === 'string' ? o.name : undefined,
        mime: typeof o.mime === 'string' ? o.mime : (typeof o.contentType === 'string' ? o.contentType : undefined),
        size: typeof o.size === 'number' ? o.size : undefined,
      }
    })
  }
  return []
}

/**
 * Fetch the text of an attachment.
 *
 * - text/plain → return the email body as the synthesised text.
 * - PDF (mime application/pdf or .pdf filename) → download bytes from
 *   `att.url` and pass through pdf-parse. Falls back to email body on
 *   any error so the pipeline keeps moving.
 * - Anything else → email body fallback.
 */
async function fetchAttachmentText(
  att: EmailAttachment,
  fallback: string
): Promise<string> {
  if (att.mime === 'text/plain') return fallback

  const looksLikePdf =
    (att.mime || '').toLowerCase().includes('pdf') ||
    /\.pdf(\?|$)/i.test(att.url || att.name || '')
  if (!looksLikePdf || !att.url) return fallback

  try {
    const buf = await downloadAttachmentBytes(att.url)
    if (!buf || buf.length === 0) return fallback
    const text = await extractPdfText(buf)
    if (text && text.trim().length > 50) return text
  } catch (err) {
    logger.warn('PDF text extraction failed (using email body)', {
      metadata: { url: att.url }, error: err,
    })
  }
  return fallback
}

async function downloadAttachmentBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch {
    return null
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse. Wrapped so a
 * failing PDF library never crashes the ingest pipeline.
 */
async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod: any = await import('pdf-parse')
    const fn = (mod.default || mod) as (b: Buffer) => Promise<{ text: string }>
    const result = await fn(buf)
    return (result?.text || '').trim()
  } catch (err) {
    logger.warn('pdf-parse threw', { error: err })
    return ''
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// =====================================================
// Direct upload ingest
// =====================================================

export interface UploadInput {
  fileName: string
  mime: string
  rawText: string
  fileBytes?: Buffer
  uploadedBy?: string | null
  supplierIdHint?: string | null
}

export async function ingestFromUpload(input: UploadInput): Promise<{ invoiceId: string | null; duplicate: boolean; error?: string }> {
  const supabase = createAdminClient()
  const fileHash = input.fileBytes
    ? createHash('sha256').update(input.fileBytes).digest('hex')
    : sha256(input.rawText)

  const { data: dup } = await supabase
    .from('incoming_invoices')
    .select('id')
    .eq('file_hash', fileHash)
    .limit(1)
    .maybeSingle()
  if (dup) return { invoiceId: dup.id, duplicate: true }

  const { data: ins, error } = await supabase
    .from('incoming_invoices')
    .insert({
      source: 'upload',
      uploaded_by: input.uploadedBy ?? null,
      file_name: input.fileName,
      mime_type: input.mime,
      file_size_bytes: input.fileBytes?.length ?? null,
      file_hash: fileHash,
      raw_text: input.rawText,
      supplier_id: input.supplierIdHint ?? null,
      status: 'received',
      parse_status: 'pending',
    })
    .select('id')
    .single()
  if (error || !ins) return { invoiceId: null, duplicate: false, error: error?.message ?? 'insert failed' }

  await auditLog({
    incomingInvoiceId: ins.id,
    action: 'ingested',
    message: `upload: ${input.fileName}`,
    actorId: input.uploadedBy ?? null,
  })

  await parseAndMatch(ins.id)
  return { invoiceId: ins.id, duplicate: false }
}

// =====================================================
// Parse + match (driven by status='received' / parse_status='pending')
// =====================================================

export async function parseAndMatch(invoiceId: string): Promise<{
  parsed: boolean
  matched: boolean
  duplicate: boolean
  message: string
}> {
  const supabase = createAdminClient()

  const { data: row } = await supabase
    .from('incoming_invoices')
    .select('id, raw_text, file_hash, status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!row) return { parsed: false, matched: false, duplicate: false, message: 'not found' }

  const text = row.raw_text || ''
  const parsed = parseSupplierInvoiceText(text)

  const match = await matchSupplierInvoice({
    supplierName: parsed.supplierName,
    supplierVatNumber: parsed.supplierVatNumber,
    invoiceNumber: parsed.invoiceNumber,
    workOrderHints: parsed.workOrderHints,
    supplierOrderRefs: parsed.supplierOrderRefs,
    deliveryAddressHints: parsed.deliveryAddressHints,
    fileHash: row.file_hash,
  })

  // If duplicate of another row, mark and stop.
  if (match.duplicateOfId && match.duplicateOfId !== invoiceId) {
    await supabase
      .from('incoming_invoices')
      .update({
        duplicate_of_id: match.duplicateOfId,
        status: 'cancelled',
        parse_status: 'parsed',
        parse_confidence: parsed.confidence,
        match_breakdown: match.breakdown as unknown as Record<string, unknown>,
      })
      .eq('id', invoiceId)
    await auditLog({
      incomingInvoiceId: invoiceId,
      action: 'duplicate_detected',
      message: `duplicate_of=${match.duplicateOfId} reasons=${match.breakdown.reasons.join(',')}`,
      newValue: { match_breakdown: match.breakdown },
    })
    return { parsed: true, matched: false, duplicate: true, message: 'duplicate' }
  }

  // Phase 15.1 — needs_review threshold (parse + match averaged < 0.7).
  // Anything below the bar gets parse_status='needs_review' AND
  // requires_manual_review=true so the queue can prioritise it.
  // Status remains 'awaiting_approval' — auto-approval never happens.
  const overall = (parsed.confidence + match.confidence) / 2
  const NEEDS_REVIEW_THRESHOLD = 0.7
  const requiresReview = overall < NEEDS_REVIEW_THRESHOLD

  const parseStatus: 'parsed' | 'failed' | 'needs_review' =
    parsed.confidence === 0
      ? 'failed'
      : requiresReview
      ? 'needs_review'
      : 'parsed'

  const patch = {
    supplier_id: match.supplierId,
    supplier_name_extracted: parsed.supplierName,
    supplier_vat_number: parsed.supplierVatNumber,
    invoice_number: parsed.invoiceNumber,
    invoice_date: parsed.invoiceDate,
    due_date: parsed.dueDate,
    currency: parsed.currency,
    amount_excl_vat: parsed.amountExclVat,
    vat_amount: parsed.vatAmount,
    amount_incl_vat: parsed.amountInclVat,
    payment_reference: parsed.paymentReference,
    iban: parsed.iban,
    matched_work_order_id: match.workOrderId,
    match_confidence: match.confidence,
    match_breakdown: match.breakdown as unknown as Record<string, unknown>,
    parse_status: parseStatus,
    parse_confidence: parsed.confidence,
    requires_manual_review: requiresReview,
    status: ('awaiting_approval' as const),    // never auto-approved
  }

  const { error: updErr } = await supabase
    .from('incoming_invoices')
    .update(patch)
    .eq('id', invoiceId)
  if (updErr) {
    if ((updErr as { code?: string }).code === '23505') {
      await supabase
        .from('incoming_invoices')
        .update({ status: 'cancelled', parse_status: 'parsed', parse_confidence: parsed.confidence })
        .eq('id', invoiceId)
      await auditLog({
        incomingInvoiceId: invoiceId,
        action: 'duplicate_detected',
        message: 'unique constraint hit on (supplier_id, invoice_number)',
      })
      return { parsed: true, matched: false, duplicate: true, message: 'duplicate (DB)' }
    }
    await auditLog({ incomingInvoiceId: invoiceId, action: 'error', ok: false, message: updErr.message })
    return { parsed: false, matched: false, duplicate: false, message: updErr.message }
  }

  await auditLog({
    incomingInvoiceId: invoiceId,
    action: 'parsed',
    message: `parse=${parsed.confidence} match=${match.confidence} overall=${(overall).toFixed(3)} status=${parseStatus} review=${requiresReview}`,
    newValue: {
      invoice_number: parsed.invoiceNumber,
      supplier_id: match.supplierId,
      work_order_id: match.workOrderId,
      amount_incl_vat: parsed.amountInclVat,
      parse_field_scores: parsed.fieldScores,
      match_breakdown: match.breakdown,
      requires_manual_review: requiresReview,
    },
  })

  console.log(
    'INCOMING INVOICE PARSED:',
    invoiceId,
    `parse=${parsed.confidence}`,
    `match=${match.confidence}`,
    `status=${parseStatus}`,
    requiresReview ? '⚠ NEEDS REVIEW' : '',
  )
  return {
    parsed: true,
    matched: !!match.supplierId,
    duplicate: false,
    message: `parse=${parsed.confidence} match=${match.confidence} review=${requiresReview}`,
  }
}

// =====================================================
// Approval / rejection
// =====================================================

export async function approveInvoice(
  invoiceId: string,
  approverId: string,
  options: { acknowledgeReview?: boolean } = {}
): Promise<{ ok: boolean; message: string; externalId?: string }> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('incoming_invoices')
    .select('id, status, supplier_id, amount_incl_vat, requires_manual_review, parse_status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!row) return { ok: false, message: 'not found' }
  if (row.status !== 'awaiting_approval' && row.status !== 'received') {
    return { ok: false, message: `status is ${row.status}, expected awaiting_approval` }
  }
  if (row.requires_manual_review && !options.acknowledgeReview) {
    await auditLog({
      incomingInvoiceId: invoiceId,
      action: 'error',
      ok: false,
      actorId: approverId,
      message: 'approval blocked — requires_manual_review=true; pass acknowledgeReview:true to override',
    })
    return {
      ok: false,
      message: 'Faktura kræver manuel gennemgang. Bekræft eksplicit (acknowledgeReview).',
    }
  }

  const { error } = await supabase
    .from('incoming_invoices')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('status', row.status) // race-safe
  if (error) return { ok: false, message: error.message }

  await auditLog({
    incomingInvoiceId: invoiceId,
    action: 'approved',
    actorId: approverId,
    previousValue: { status: row.status },
    newValue: { status: 'approved' },
    message: `approved by ${approverId}`,
  })
  console.log('INCOMING INVOICE APPROVED:', invoiceId, '→ by', approverId)

  // Push to e-conomic. Best-effort.
  try {
    const { pushSupplierInvoiceToEconomic } = await import('@/lib/services/economic-client')
    const econ = await pushSupplierInvoiceToEconomic(invoiceId)
    if (econ.status === 'success') {
      await auditLog({
        incomingInvoiceId: invoiceId,
        action: 'posted',
        message: `e-conomic external_id=${econ.externalId}`,
        newValue: { external_invoice_id: econ.externalId },
      })
      return { ok: true, message: 'approved + posted', externalId: econ.externalId }
    }
    if (econ.status === 'skipped') {
      await auditLog({
        incomingInvoiceId: invoiceId,
        action: 'posted',
        ok: false,
        message: `e-conomic skipped: ${econ.reason ?? 'unknown'}`,
      })
      return { ok: true, message: `approved (e-conomic skipped: ${econ.reason})` }
    }
    await auditLog({
      incomingInvoiceId: invoiceId,
      action: 'posted',
      ok: false,
      message: `e-conomic failed: ${econ.error ?? 'unknown'}`,
    })
    return { ok: true, message: `approved (e-conomic failed: ${econ.error})` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await auditLog({ incomingInvoiceId: invoiceId, action: 'error', ok: false, message: msg })
    return { ok: true, message: `approved (e-conomic threw: ${msg})` }
  }
}

export async function rejectInvoice(invoiceId: string, rejecterId: string, reason: string): Promise<{ ok: boolean; message: string }> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('incoming_invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!row) return { ok: false, message: 'not found' }
  if (row.status === 'posted' || row.status === 'rejected' || row.status === 'cancelled') {
    return { ok: false, message: `cannot reject ${row.status} invoice` }
  }
  const { error } = await supabase
    .from('incoming_invoices')
    .update({
      status: 'rejected',
      rejected_by: rejecterId,
      rejected_at: new Date().toISOString(),
      rejected_reason: reason,
    })
    .eq('id', invoiceId)
  if (error) return { ok: false, message: error.message }
  await auditLog({
    incomingInvoiceId: invoiceId,
    action: 'rejected',
    actorId: rejecterId,
    previousValue: { status: row.status },
    newValue: { status: 'rejected', reason },
    message: reason,
  })
  console.log('INCOMING INVOICE REJECTED:', invoiceId, '→', reason)
  return { ok: true, message: 'rejected' }
}

// =====================================================
// Reads
// =====================================================

export async function getApprovalQueue(limit = 100): Promise<IncomingInvoiceRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('incoming_invoices')
    .select('*')
    .in('status', ['received', 'awaiting_approval'])
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as IncomingInvoiceRow[]
}

export async function getInvoiceById(id: string): Promise<IncomingInvoiceRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('incoming_invoices').select('*').eq('id', id).maybeSingle()
  return (data as IncomingInvoiceRow | null) ?? null
}
