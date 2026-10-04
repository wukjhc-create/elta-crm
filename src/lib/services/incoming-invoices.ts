/**
 * Incoming supplier invoice orchestrator (Phase 15).
 *
 * Public surface:
 *   - ingestFromEmail(emailId)        — inspects an incoming_emails row,
 *                                       creates one incoming_invoices row
 *                                       per PDF/HTML attachment that looks
 *                                       like an invoice, runs parse + match.
 *   - ingestFromUpload(...)           — manuel upload (Leverandørfaktura → Upload faktura).
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

/** Statusser hvor fakturaen er afgjort og ikke maa genaabnes (P3 #19). */
export const LOCKED_INVOICE_STATUSES: string[] = ['approved', 'posted', 'rejected', 'cancelled']

export async function ingestFromEmail(emailId: string): Promise<IngestEmailResult> {
  const result: IngestEmailResult = { ingested: 0, duplicates: 0, errors: [], invoiceIds: [], upgraded: 0, skipped: [] }
  const supabase = createAdminClient()

  const { data: email, error: readErr } = await supabase
    .from('incoming_emails')
    .select('id, sender_email, sender_name, subject, body_text, body_preview, attachment_urls, has_attachments, graph_message_id, to_email, customer_id')
    .eq('id', emailId)
    .maybeSingle()
  if (readErr || !email) {
    result.errors.push(`email ${emailId} not found`)
    return result
  }

  // IC13: en mail som kunden SELV har sendt (afsender = den koblede kundes e-mail) er ikke en leverandoerfaktura.
  // Prod: 20 af 50 "faktura-mails" var kundens egne mails med billeder/bilag. Deterministisk frasortering.
  if (await isCustomerOwnMail(supabase, email)) {
    result.skipped!.push('customer_mail')
    return result
  }

  // Vedhaeftninger hentes KUN naar INVOICE_ATTACHMENT_FETCH_ENABLED er TIL (default OFF = uaendret adfaerd).
  // Kun LAESNING fra postkassen + upload til privat storage; aldrig arkivering i customer_documents (portal).
  // Fejl ved hentning -> fallback til broedtekst som i dag. Se src/lib/invoice-control/attachment-gate.ts.
  let attachmentUrls: unknown = email.attachment_urls
  const { isInvoiceAttachmentFetchEnabled, shouldFetchAttachments } = await import('@/lib/invoice-control/attachment-gate')
  if (shouldFetchAttachments(email, isInvoiceAttachmentFetchEnabled())) {
    try {
      const { processEmailAttachments } = await import('@/lib/services/email-attachment-storage')
      await processEmailAttachments(emailId, email.graph_message_id as string, email.to_email || undefined, { archiveToCustomer: false })
      const { data: fresh } = await supabase.from('incoming_emails').select('attachment_urls').eq('id', emailId).maybeSingle()
      attachmentUrls = (fresh as { attachment_urls?: unknown } | null)?.attachment_urls ?? attachmentUrls
    } catch (err) {
      logger.warn('ingestFromEmail: attachment fetch failed — falling back to body', { entityId: emailId, error: err })
      result.errors.push(`attachment fetch failed (fallback til brødtekst): ${err instanceof Error ? err.message.slice(0, 80) : 'ukendt'}`)
    }
  }

  const bodyText = email.body_text || email.body_preview || ''
  const attachments: EmailAttachment[] = parseAttachments(attachmentUrls)
  const candidates = attachments.filter(isLikelyInvoiceAttachment)

  // No attachments: still ingest the email body as a single record (some
  // suppliers email plain-text invoices). Skip if body is tiny.
  if (candidates.length === 0) {
    if (bodyText.trim().length < 200) return result
    await insertEmailInvoice(supabase, emailId, email.sender_name, { name: bodyInvoiceName(emailId), mime: 'text/plain' }, bodyText, result)
    return logIngest(emailId, result)
  }

  // IC11: findes der allerede en (ulaast) broedtekst-faktura for mailen, OPGRADERES den med vedhaeftningens tekst i
  // stedet for at oprette en ny raekke — ellers dubletfakturaer ved backfill/genkoersel.
  const { data: existingRows } = await supabase.from('incoming_invoices').select('id, status, file_name').eq('source_email_id', emailId)
  const existing = (existingRows ?? []) as Array<{ id: string; status: string; file_name: string | null }>
  let bodyInvoice = existing.find((r) => r.file_name === bodyInvoiceName(emailId) && !LOCKED_INVOICE_STATUSES.includes(r.status)) ?? null
  let mailHasInvoice = existing.length > 0

  // Udtraek tekst foerst; vedhaeftninger MED fakturanummer behandles foerst (deterministisk raekkefoelge).
  const texts = await Promise.all(candidates.map(async (att) => ({ att, text: await extractAttachmentText(att) })))
  const ranked = texts
    .map((t) => ({ ...t, invoiceNumber: t.text ? parseSupplierInvoiceText(t.text).invoiceNumber : null }))
    .sort((a, b) => Number(!!b.invoiceNumber) - Number(!!a.invoiceNumber) || (a.att.name ?? '').localeCompare(b.att.name ?? ''))

  for (const { att, text, invoiceNumber } of ranked) {
    try {
      if (!text) {
        // Ingen udtrukket tekst (ikke-PDF / ulaeselig): broedtekst-fallback kun hvis mailen ikke allerede har en faktura.
        if (mailHasInvoice) { result.skipped!.push('unreadable_attachment'); continue }
        if (await insertEmailInvoice(supabase, emailId, email.sender_name, att, bodyText, result)) mailHasInvoice = true
        continue
      }
      const fileHash = sha256(text)
      const { data: dup } = await supabase.from('incoming_invoices').select('id').eq('file_hash', fileHash).limit(1).maybeSingle()
      if (dup) { result.duplicates++; continue }

      if (bodyInvoice) {
        const upgraded = await upgradeBodyInvoice(supabase, emailId, bodyInvoice, att, text, fileHash)
        if (upgraded === 'upgraded') { result.upgraded!++; result.invoiceIds.push(bodyInvoice.id); bodyInvoice = null; continue }
        if (upgraded === 'duplicate') { result.duplicates++; continue }
        bodyInvoice = null // raekken blev aendret af en anden imens — almindelig regel nedenfor
      }
      // Ekstra vedhaeftninger paa en mail der allerede har en faktura: kun hvis teksten har et fakturanummer
      // (ellers typisk handelsbetingelser/foelgeseddel -> stoej i godkendelseskoeen).
      if (mailHasInvoice && !invoiceNumber) { result.skipped!.push('non_invoice_attachment'); continue }
      if (await insertEmailInvoice(supabase, emailId, email.sender_name, att, text, result)) mailHasInvoice = true
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  return logIngest(emailId, result)
}

function bodyInvoiceName(emailId: string): string {
  return `email-${emailId}.txt`
}

function logIngest(emailId: string, result: IngestEmailResult): IngestEmailResult {
  console.log('INCOMING INVOICE EMAIL INGEST:', emailId, 'ingested=' + result.ingested, 'upgraded=' + (result.upgraded ?? 0),
    'dup=' + result.duplicates, 'skipped=' + (result.skipped?.length ?? 0), 'err=' + result.errors.length)
  return result
}

type AdminClient = ReturnType<typeof createAdminClient>

/** Egne maildomaener (samme liste som 00169 / prod-preview-customer-mail-invoices.ts). */
export const INTERNAL_MAIL_DOMAINS = ['eltasolar.dk']

/** IC13: afsender er praecis den e-mail der staar paa mailens koblede kunde. */
export async function isCustomerOwnMail(supabase: AdminClient, email: { customer_id?: string | null; sender_email?: string | null }): Promise<boolean> {
  if (!email.customer_id || !email.sender_email) return false
  // Eget domaene frasorteres aldrig automatisk: en medarbejder kan videresende en aegte leverandoerfaktura fra en
  // adresse der ogsaa staar paa en (test)kunde. Ingen gaet — den slags vurderes manuelt.
  if (INTERNAL_MAIL_DOMAINS.includes(email.sender_email.trim().toLowerCase().split('@')[1] ?? '')) return false
  const { data: customer } = await supabase.from('customers').select('email').eq('id', email.customer_id).maybeSingle()
  const custEmail = ((customer as { email?: string | null } | null)?.email || '').trim().toLowerCase()
  return !!custEmail && custEmail === email.sender_email.trim().toLowerCase()
}

/** Indsaet en ny mail-faktura (hash-dedup) og koer parse+match. Returnerer true hvis en raekke blev oprettet. */
async function insertEmailInvoice(
  supabase: AdminClient, emailId: string, senderName: string | null, att: EmailAttachment, rawText: string, result: IngestEmailResult,
): Promise<boolean> {
  const fileHash = rawText ? sha256(rawText) : null
  // Hard-dedup on file hash — UNIQUE index on file_hash blocks the row;
  // we pre-check to log it as a duplicate cleanly.
  if (fileHash) {
    const { data: dup } = await supabase.from('incoming_invoices').select('id').eq('file_hash', fileHash).limit(1).maybeSingle()
    if (dup) { result.duplicates++; return false }
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
      supplier_name_extracted: senderName ?? null,
      status: 'received',
      parse_status: 'pending',
    })
    .select('id')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') { result.duplicates++; return false }
    result.errors.push(`${att.name ?? 'attachment'}: ${error.message}`)
    return false
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
  return true
}

/** Header-felter der blev udledt af broedteksten og nulstilles, naar den autoritative PDF-tekst overtager. */
const BODY_DERIVED_FIELDS = ['supplier_vat_number', 'invoice_number', 'invoice_date', 'due_date', 'amount_excl_vat', 'vat_amount',
  'amount_incl_vat', 'payment_reference', 'iban'] as const

/**
 * IC11: opgrader en ulaast broedtekst-faktura med vedhaeftningens tekst. Race-/idempotens-sikker: opdateringen
 * kraever uaendret status OG at raekken stadig er broedtekst-fakturaen; derefter deterministisk genparse.
 * supplier_id og leverandoernavn bevares (eksisterende match). Forrige vaerdier gemmes i audit-loggen.
 */
async function upgradeBodyInvoice(
  supabase: AdminClient, emailId: string, inv: { id: string; status: string }, att: EmailAttachment, text: string, fileHash: string,
): Promise<'upgraded' | 'duplicate' | 'conflict'> {
  const { data: prev } = await supabase.from('incoming_invoices')
    .select(`status, parse_status, file_name, ${BODY_DERIVED_FIELDS.join(', ')}`).eq('id', inv.id).maybeSingle()
  const reset = Object.fromEntries(BODY_DERIVED_FIELDS.map((f) => [f, null]))
  const { data: rows, error } = await supabase
    .from('incoming_invoices')
    .update({
      ...reset,
      raw_text: text,
      file_hash: fileHash,
      file_url: att.url ?? null,
      file_name: att.name ?? null,
      mime_type: att.mime ?? 'application/pdf',
      file_size_bytes: att.size ?? null,
      duplicate_of_id: null,
      status: 'received',
      parse_status: 'pending',
    })
    .eq('id', inv.id)
    .eq('status', inv.status)
    .eq('file_name', bodyInvoiceName(emailId))
    .select('id')
  if (error) {
    if ((error as { code?: string }).code === '23505') return 'duplicate'
    throw new Error(`upgrade ${inv.id}: ${error.message}`)
  }
  if (!rows || rows.length !== 1) return 'conflict'
  await auditLog({
    incomingInvoiceId: inv.id,
    action: 'upgraded_from_attachment',
    message: `brødtekst erstattet af vedhæftning ${att.name ?? '(ukendt)'} fra email ${emailId}`,
    previousValue: prev ?? null,
    newValue: { file_name: att.name ?? null, mime_type: att.mime ?? null },
  })
  try {
    await parseAndMatch(inv.id)
  } catch (err) {
    await auditLog({ incomingInvoiceId: inv.id, action: 'error', ok: false, message: err instanceof Error ? err.message : String(err) })
  }
  return 'upgraded'
}

function parseAttachments(raw: unknown): EmailAttachment[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((r): EmailAttachment => {
      if (typeof r === 'string') return { url: r, name: r.split('/').pop() ?? r }
      const o = r as Record<string, unknown>
      return {
        url: typeof o.url === 'string' ? o.url : undefined,
        // email-attachment-storage gemmer {filename, contentType, url, storagePath}
        name: typeof o.name === 'string' ? o.name : (typeof o.filename === 'string' ? o.filename : undefined),
        mime: typeof o.mime === 'string' ? o.mime : (typeof o.contentType === 'string' ? o.contentType : undefined),
        size: typeof o.size === 'number' ? o.size : undefined,
      }
    })
  }
  return []
}

/**
 * Udtraek tekst fra en vedhaeftning. Returnerer null naar der ikke kunne udtraekkes brugbar tekst (ikke-PDF,
 * download-fejl, ulaeselig PDF) — kalderen beslutter fallback. PDF via pdf-parse v2 (IC12).
 */
async function extractAttachmentText(att: EmailAttachment): Promise<string | null> {
  const looksLikePdf =
    (att.mime || '').toLowerCase().includes('pdf') ||
    /\.pdf(\?|$)/i.test(att.url || att.name || '')
  if (!looksLikePdf || !att.url) return null
  try {
    const buf = await downloadAttachmentBytes(att.url)
    if (!buf || buf.length === 0) return null
    const { extractPdfText } = await import('@/lib/invoice-control/pdf-text')
    const text = await extractPdfText(buf)
    if (text && text.trim().length > 50) return text
  } catch (err) {
    logger.warn('PDF text extraction failed', { metadata: { file: att.name }, error: err })
  }
  return null
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
  /** Gemt fil som "bucket/sti" (privat; signeres ved visning). */
  fileUrl?: string | null
  uploadedBy?: string | null
  supplierIdHint?: string | null
}

/**
 * Vedhæft bilag (PDF/billede) til en EKSISTERENDE leverandørfaktura uden fil — typisk mail-fakturaer hvor kun
 * mailteksten blev gemt (vedhæftningshentning slået fra). Udtrukket PDF-tekst erstatter mailteksten (bedre grundlag),
 * og fakturaen læses igen. Låste fakturaer (godkendt/bogført/afvist/annulleret) og fakturaer med fil afvises.
 * Dedup-nøglen (file_hash) bevares, så samme mail ikke kan oprette fakturaen igen.
 */
export async function attachFileToInvoice(input: UploadInput & { invoiceId: string }): Promise<{ ok: boolean; message: string; parsed?: boolean }> {
  const supabase = createAdminClient()
  const { data: row, error } = await supabase.from('incoming_invoices').select('id, status, file_url, raw_text').eq('id', input.invoiceId).maybeSingle()
  if (error || !row) return { ok: false, message: 'Faktura ikke fundet' }
  if (LOCKED_INVOICE_STATUSES.includes(row.status as string)) return { ok: false, message: `Fakturaen er ${row.status} — bilag kan ikke ændres` }
  if (row.file_url) return { ok: false, message: 'Fakturaen har allerede et bilag' }
  const text = input.rawText.trim()
  const { error: upErr } = await supabase.from('incoming_invoices').update({
    file_name: input.fileName,
    file_url: input.fileUrl ?? null,
    mime_type: input.mime,
    file_size_bytes: input.fileBytes?.length ?? null,
    ...(text ? { raw_text: input.rawText } : {}),
    parse_status: 'pending',
  }).eq('id', input.invoiceId)
  if (upErr) return { ok: false, message: 'Kunne ikke gemme bilaget' }
  await auditLog({
    incomingInvoiceId: input.invoiceId,
    action: 'file_attached',
    message: `bilag vedhæftet: ${input.fileName}${text ? '' : ' (ingen tekst — scannet?)'}`,
    actorId: input.uploadedBy ?? null,
  })
  const r = await parseAndMatch(input.invoiceId)
  return {
    ok: true,
    parsed: r.parsed,
    message: text ? (r.parsed ? 'Bilag vedhæftet og fakturaen læst igen' : `Bilag vedhæftet — ${r.message}`) : 'Bilag vedhæftet — ingen tekst i filen, udfyld felterne manuelt',
  }
}

export async function ingestFromUpload(input: UploadInput): Promise<{ invoiceId: string | null; duplicate: boolean; error?: string }> {
  const supabase = createAdminClient()
  // Samme dedup-nøgle som mail-flowet (hash af udtrukket tekst), så samme faktura via mail OG upload kun
  // oprettes én gang. Uden tekst (scannet PDF) bruges filens bytes.
  const fileHash = input.rawText.trim()
    ? sha256(input.rawText)
    : input.fileBytes
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
      file_url: input.fileUrl ?? null,
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

/** Hints fra en struktureret kilde (API-adapteren), som regex-parseren ikke kan udlede af raw_text. */
export interface StructuredHints { supplierOrderRefs?: string[]; workOrderHints?: string[] }

export async function parseAndMatch(invoiceId: string, hints: StructuredHints = {}): Promise<{
  parsed: boolean
  matched: boolean
  duplicate: boolean
  message: string
}> {
  const supabase = createAdminClient()

  const { data: row } = await supabase
    .from('incoming_invoices')
    .select('id, raw_text, file_hash, status, supplier_id, supplier_name_extracted, supplier_vat_number, invoice_number, invoice_date, due_date, currency, amount_excl_vat, vat_amount, amount_incl_vat, payment_reference, iban, source_email_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!row) return { parsed: false, matched: false, duplicate: false, message: 'not found' }
  // P3 #19: en godkendt/bogfoert/afvist/annulleret faktura maa ALDRIG genaabnes af reparse — ellers kan den
  // godkendes igen og skubbes til e-conomic en gang til.
  if (LOCKED_INVOICE_STATUSES.includes(row.status)) {
    return { parsed: false, matched: false, duplicate: false, message: `låst: status er ${row.status} — genparse ikke tilladt` }
  }

  const text = row.raw_text || ''
  const parsed = parseSupplierInvoiceText(text)

  // IC5: en eksisterende (struktureret, fx API) vaerdi vinder ALTID over regex-parse — og en tom parse maa
  // aldrig overskrive en kendt vaerdi. For mail-fakturaer er felterne tomme ved foerste parse (uaendret adfaerd).
  const pick = <T,>(existing: T | null | undefined, parsedValue: T | null | undefined): T | null =>
    existing !== null && existing !== undefined && (existing as unknown) !== '' ? existing : (parsedValue ?? null)
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

  const match = await matchSupplierInvoice({
    supplierName: pick(row.supplier_name_extracted, parsed.supplierName),
    supplierVatNumber: pick(row.supplier_vat_number, parsed.supplierVatNumber),
    invoiceNumber: pick(row.invoice_number, parsed.invoiceNumber),
    workOrderHints: uniq([...(hints.workOrderHints ?? []), ...parsed.workOrderHints]),
    supplierOrderRefs: uniq([...(hints.supplierOrderRefs ?? []), ...parsed.supplierOrderRefs]),
    deliveryAddressHints: parsed.deliveryAddressHints,
    fileHash: row.file_hash,
    excludeInvoiceId: invoiceId,
    knownSupplierId: row.supplier_id,
    // N66: mail-fakturaens afsender (domaene → leverandoer)
    senderEmail: row.source_email_id
      ? await (async () => {
          const { data: m } = await supabase.from('incoming_emails').select('sender_email, original_sender_email').eq('id', row.source_email_id).maybeSingle()
          const r = m as { sender_email?: string | null; original_sender_email?: string | null } | null
          return r?.original_sender_email || r?.sender_email || null // videresendt → oprindelig afsender
        })()
      : null,
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
    supplier_id: pick(row.supplier_id, match.supplierId),
    supplier_name_extracted: pick(row.supplier_name_extracted, parsed.supplierName),
    supplier_vat_number: pick(row.supplier_vat_number, parsed.supplierVatNumber),
    invoice_number: pick(row.invoice_number, parsed.invoiceNumber),
    invoice_date: pick(row.invoice_date, parsed.invoiceDate),
    due_date: pick(row.due_date, parsed.dueDate),
    currency: pick(row.currency, parsed.currency),
    amount_excl_vat: pick(row.amount_excl_vat, parsed.amountExclVat),
    vat_amount: pick(row.vat_amount, parsed.vatAmount),
    amount_incl_vat: pick(row.amount_incl_vat, parsed.amountInclVat),
    payment_reference: pick(row.payment_reference, parsed.paymentReference),
    iban: pick(row.iban, parsed.iban),
    matched_work_order_id: match.workOrderId,
    matched_case_id: match.caseId,
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
      case_id: match.caseId,
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

  const { data: approvedRows, error } = await supabase
    .from('incoming_invoices')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('status', row.status) // race-safe
    .select('id')
  if (error) return { ok: false, message: error.message }
  // P3 #19: tabte vi racet (en anden godkendte/aendrede fakturaen imens), er der opdateret 0 raekker — saa maa
  // der hverken logges godkendelse eller skubbes til e-conomic (ellers dobbelt-bogfoering).
  if (!approvedRows || approvedRows.length !== 1) {
    return { ok: false, message: 'Fakturaen blev ændret af en anden imens — intet godkendt eller bogført. Opdatér og prøv igen.' }
  }

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

// =====================================================
// Phase 15.3 — Supplier API ingestion
// =====================================================

import type { InvoiceAdapterProvider } from '@/lib/services/incoming-invoice-adapters/types'

export interface SupplierApiIngestResult {
  provider: InvoiceAdapterProvider
  fetched: number
  inserted: number
  duplicates: number
  errors: string[]
  invoiceIds: string[]
  skipped: boolean
  skipReason?: string
}

/**
 * Pull invoices from a supplier's API/EDI feed and insert any that
 * haven't been seen before (dedup via supplier+invoice_number AND
 * file_hash). Always runs parseAndMatch on every newly-inserted row.
 *
 * Fail-safe: any adapter throw / API error is caught and surfaces in
 * the result so the cron continues processing other providers.
 */
export async function ingestFromSupplierAPI(
  provider: InvoiceAdapterProvider,
  options: { sinceDays?: number } = {}
): Promise<SupplierApiIngestResult> {
  const supabase = createAdminClient()
  const { getInvoiceAdapter } = await import('@/lib/services/incoming-invoice-adapters/registry')
  const sinceDays = options.sinceDays ?? 30
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const result: SupplierApiIngestResult = {
    provider,
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    errors: [],
    invoiceIds: [],
    skipped: false,
  }

  // Resolve supplier_id once.
  const { data: supplierRow } = await supabase
    .from('suppliers')
    .select('id, code')
    .ilike('code', provider)
    .maybeSingle()
  if (!supplierRow) {
    result.skipped = true
    result.skipReason = `supplier ${provider} not found`
    console.log('API INVOICE INGEST SKIPPED:', provider, result.skipReason)
    return result
  }

  let adapterRes
  try {
    const adapter = getInvoiceAdapter(provider)
    adapterRes = await adapter.fetchInvoices({ sinceIso })
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
    logger.error('ingestFromSupplierAPI: adapter fetch threw', {
      metadata: { provider }, error: err,
    })
    return result
  }

  if (adapterRes.skipped) {
    result.skipped = true
    result.skipReason = adapterRes.skipReason
    console.log('API INVOICE INGEST SKIPPED:', provider, adapterRes.skipReason)
    return result
  }

  result.fetched = adapterRes.invoices.length

  for (const norm of adapterRes.invoices) {
    try {
      const fileHash = sha256(`${provider}|${norm.invoiceNumber}|${norm.rawText}`)

      // Pre-dedup: file_hash → existing.
      const { data: hashHit } = await supabase
        .from('incoming_invoices')
        .select('id')
        .eq('file_hash', fileHash)
        .limit(1)
        .maybeSingle()
      if (hashHit) {
        result.duplicates++
        continue
      }

      // Pre-dedup: (supplier_id, invoice_number) → existing.
      const { data: refHit } = await supabase
        .from('incoming_invoices')
        .select('id')
        .eq('supplier_id', supplierRow.id)
        .eq('invoice_number', norm.invoiceNumber)
        .limit(1)
        .maybeSingle()
      if (refHit) {
        result.duplicates++
        continue
      }

      const { data: ins, error } = await supabase
        .from('incoming_invoices')
        .insert({
          source: 'manual',                                 // 'api' isn't in the source CHECK; reuse 'manual' + notes
          supplier_id: supplierRow.id,
          supplier_name_extracted: provider,
          file_url: norm.fileUrl,
          file_name: norm.fileName,
          mime_type: norm.mimeType,
          file_hash: fileHash,
          raw_text: norm.rawText,
          invoice_number: norm.invoiceNumber,
          invoice_date: norm.invoiceDate,
          due_date: norm.dueDate,
          currency: norm.currency,
          amount_excl_vat: norm.amountExclVat,
          vat_amount: norm.vatAmount,
          amount_incl_vat: norm.amountInclVat,
          payment_reference: norm.paymentReference,
          iban: norm.iban,
          status: 'received',
          parse_status: 'pending',
          notes: `api-ingest:${provider}`,
        })
        .select('id')
        .single()

      if (error || !ins) {
        if ((error as { code?: string } | null)?.code === '23505') {
          result.duplicates++
          continue
        }
        result.errors.push(`${provider}/${norm.invoiceNumber}: ${error?.message ?? 'insert failed'}`)
        continue
      }

      const invoiceId = ins.id

      // Insert lines (best-effort). Leverandoerens varenummer bevares i raw_line, og linjen matches
      // deterministisk til supplier_products (sku -> ean -> varenr. i teksten) — grundlag for fakturakontrol.
      if (norm.lines.length > 0) {
        const { resolveLineProducts } = await import('@/lib/invoice-control/line-matcher')
        const matches = await resolveLineProducts(supabase, supplierRow.id, norm.lines.map((l) => ({
          lineNumber: l.lineNumber, description: l.description, supplierProductCode: l.supplierProductCode,
        })))
        const { error: lineErr } = await supabase
          .from('incoming_invoice_lines')
          .insert(
            norm.lines.map((l, i) => ({
              incoming_invoice_id: invoiceId,
              line_number: l.lineNumber,
              description: l.description,
              quantity: l.quantity,
              unit: l.unit,
              unit_price: l.unitPrice,
              total_price: l.totalPrice,
              supplier_product_id: matches[i]?.supplierProductId ?? null,
              raw_line: JSON.stringify({ supplier_product_code: l.supplierProductCode, match_method: matches[i]?.method ?? null }),
            }))
          )
        if (lineErr) {
          logger.warn('ingestFromSupplierAPI: lines insert failed', {
            entityId: invoiceId, error: lineErr,
          })
        }
      }

      result.inserted++
      result.invoiceIds.push(invoiceId)
      console.log('API INVOICE INGESTED:', provider, norm.invoiceNumber)

      await auditLog({
        incomingInvoiceId: invoiceId,
        action: 'ingested',
        message: `api:${provider} invoice=${norm.invoiceNumber}`,
        newValue: { source: 'api', provider, invoice_number: norm.invoiceNumber },
      })

      try {
        await parseAndMatch(invoiceId, { supplierOrderRefs: norm.supplierOrderRefs, workOrderHints: norm.workOrderHints })
      } catch (err) {
        logger.warn('ingestFromSupplierAPI: parseAndMatch threw', {
          entityId: invoiceId, error: err,
        })
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  console.log(
    'API INVOICE INGEST DONE:',
    provider,
    `fetched=${result.fetched}`,
    `inserted=${result.inserted}`,
    `dup=${result.duplicates}`,
    `err=${result.errors.length}`
  )
  return result
}
