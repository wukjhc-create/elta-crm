'use server'

/**
 * Phase B1 — server actions for document_confirmations.
 *
 * SIKKERHEDSPRINCIPPER:
 *
 *  1. Authenticated server actions (create, list, revoke) bruger
 *     getAuthenticatedClient() — RLS-policy "Authenticated full access"
 *     haandhaever access. Brugeren skal vaere logget ind.
 *
 *  2. Public server actions (getConfirmationContext, submitConfirmation)
 *     bruger createAdminClient() — service-role bypasser RLS, men kun
 *     server-side. 'use server' + import af createAdminClient i denne
 *     fil betyder klient-bundlet aldrig ser service-role-noeglen.
 *
 *  3. Public actions returnerer ALDRIG raw DB-row. View-model er curated
 *     i PublicConfirmationContext — felter som created_by, metadata,
 *     internal IDs, mail_error, etc. udelades.
 *
 *  4. submitConfirmation er atomisk: UPDATE med WHERE-guard paa
 *     status IN ('sent','opened') AND expires_at > NOW(). Sekundaer
 *     lookup forklarer fejlen pent hvis guard miss'er.
 *
 *  5. 'expired' beregnes ALTID fra expires_at < NOW() AND status IN
 *     ('sent','opened') — aldrig fra status-vaerdien (som ikke har
 *     'expired'). Ingen cron behoevet.
 */

import { headers } from 'next/headers'
import {
  getAuthenticatedClient,
  formatError,
  ActionError,
} from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import {
  RECIPIENT_ROLE_LABELS,
  type ConfirmationStatus,
  type ConfirmationRecipientRole,
  type ConfirmationRecipientType,
  type PublicConfirmationState,
  type CreateConfirmationRequestsInput,
  type CreatedConfirmation,
  type PublicConfirmationContext,
  type SubmitConfirmationInput,
  type ConfirmationListItem,
} from '@/types/document-confirmations.types'

const DEFAULT_EXPIRES_IN_DAYS = 30
const PDF_SIGNED_URL_TTL_SECONDS = 3600 // 1h

const ALLOWED_RECIPIENT_TYPES: ConfirmationRecipientType[] = ['customer', 'contact', 'manual']
const ALLOWED_RECIPIENT_ROLES: ConfirmationRecipientRole[] = [
  'orderer',
  'payer',
  'end_customer',
  'site_customer',
  'site_contact',
  'document_customer',
  'manual',
]

// =====================================================
// Interne helpers
// =====================================================

function computePublicState(row: {
  status: ConfirmationStatus
  expires_at: string
}): PublicConfirmationState {
  if (row.status === 'confirmed') return 'already_confirmed'
  if (row.status === 'revoked') return 'revoked'
  if (row.status === 'pending' || row.status === 'failed') return 'invalid'
  // status er 'sent' eller 'opened' — tjek expiry
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired'
  return 'awaiting'
}

async function getClientMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  const userAgent = h.get('user-agent') || 'unknown'
  return { ip, userAgent }
}

function buildMinimalView(
  state: PublicConfirmationState,
  expiresAt = '',
): PublicConfirmationContext {
  return {
    state,
    documentTitle: '',
    documentFileName: '',
    pdfUrl: null,
    serviceCase: null,
    recipientRoleLabel: '',
    recipientEmail: '',
    recipientName: null,
    expiresAt,
  }
}

function isPlausibleToken(token: unknown): token is string {
  if (typeof token !== 'string') return false
  if (token.length < 32 || token.length > 128) return false
  // Token er hex (64 chars typisk) — accepter alfanumerisk for fremtidsfleksibilitet
  return /^[A-Za-z0-9_-]+$/.test(token)
}

interface SequenceMetaShape {
  sequence?: { chainId?: string; order?: number; gated?: boolean }
  readyToSend?: boolean
  readyAt?: string
  [key: string]: unknown
}

/**
 * Fase 2a — efter at et kæde-trin er bekræftet: markér NÆSTE pending-trin i
 * samme kæde som "klar til at sende" (metadata.readyToSend=true). Sender
 * IKKE mail — kontoret frigiver det manuelt (kontrolpunkt før noget går til
 * en betalende partner). Best-effort: fejl må aldrig vælte selve confirm'en.
 *
 * Tager en admin-klient (kaldes fra public submitConfirmation).
 */
async function markNextChainStepReady(
  admin: ReturnType<typeof createAdminClient>,
  confirmedId: string,
): Promise<void> {
  try {
    const { data: row } = await admin
      .from('document_confirmations')
      .select('id, customer_document_id, metadata')
      .eq('id', confirmedId)
      .maybeSingle()
    const meta = (row?.metadata ?? {}) as SequenceMetaShape
    const seq = meta.sequence
    if (!row || !seq?.gated || !seq.chainId || typeof seq.order !== 'number') return

    const nextOrder = seq.order + 1
    const { data: siblings } = await admin
      .from('document_confirmations')
      .select('id, status, metadata')
      .eq('customer_document_id', row.customer_document_id)

    const next = (siblings ?? []).find((s) => {
      const m = (s.metadata ?? {}) as SequenceMetaShape
      return (
        s.status === 'pending' &&
        m.sequence?.chainId === seq.chainId &&
        m.sequence?.order === nextOrder
      )
    })
    if (!next) return

    const nextMeta = (next.metadata ?? {}) as SequenceMetaShape
    await admin
      .from('document_confirmations')
      .update({
        metadata: { ...nextMeta, readyToSend: true, readyAt: new Date().toISOString() },
      })
      .eq('id', next.id)
      .eq('status', 'pending')
  } catch (err) {
    logger.error('markNextChainStepReady failed (non-fatal)', { error: err, entityId: confirmedId })
  }
}

// =====================================================
// 1. createConfirmationRequests  (authenticated)
// =====================================================
/**
 * Opretter én row pr. modtager med unik token + expiry. Kaldes fra
 * Phase A's send-flow naar "Kraev bekraeftelse" er valgt (trin 5 i
 * sprint-planen — endnu ikke kalde-sted).
 */
export async function createConfirmationRequests(
  input: CreateConfirmationRequestsInput,
): Promise<ActionResult<CreatedConfirmation[]>> {
  try {
    validateUUID(input.documentId, 'documentId')
    if (!input.recipients || input.recipients.length === 0) {
      return { success: false, error: 'Ingen modtagere angivet' }
    }

    const { supabase, userId } = await getAuthenticatedClient()

    // Valider dokumentet eksisterer og hent service_case_id som default
    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .select('id, customer_id, service_case_id, document_type, title')
      .eq('id', input.documentId)
      .single()
    if (docErr || !doc) {
      return { success: false, error: 'Dokument ikke fundet' }
    }

    const expiresInDays = input.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS
    if (expiresInDays < 1 || expiresInDays > 365) {
      return { success: false, error: 'Ugyldig expiry (1-365 dage)' }
    }
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()

    // Fase 2a — sekventiel kæde: ét chainId for hele kæden, order = 1-baseret
    // position i recipients-arrayet. Kun trin 1 mailes senere; resten frigives
    // manuelt af kontoret. Parallel-flow (sequential udeladt/false) er uændret.
    const chainId = input.sequential ? crypto.randomUUID() : null

    // Byg insert-rows
    const rows = input.recipients.map((r, idx) => {
      if (!ALLOWED_RECIPIENT_TYPES.includes(r.recipientType)) {
        throw new ActionError(`Ugyldig recipient_type: ${r.recipientType}`)
      }
      if (!ALLOWED_RECIPIENT_ROLES.includes(r.role)) {
        throw new ActionError(`Ugyldig recipient_role: ${r.role}`)
      }
      const email = r.email?.trim().toLowerCase()
      if (!email || !email.includes('@')) {
        throw new ActionError(`Ugyldig email: ${r.email}`)
      }
      const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) }
      if (chainId) {
        metadata.sequence = { chainId, order: idx + 1, gated: true }
      }
      return {
        customer_document_id: input.documentId,
        service_case_id: doc.service_case_id ?? null,
        recipient_type: r.recipientType,
        recipient_customer_id: r.customerId ?? null,
        recipient_contact_id: r.contactId ?? null,
        recipient_email: email,
        recipient_name: r.name ?? null,
        recipient_role: r.role,
        status: 'pending' as const,
        expires_at: expiresAt,
        created_by: userId,
        metadata,
      }
    })

    const { data: created, error: insertErr } = await supabase
      .from('document_confirmations')
      .insert(rows)
      .select('id, token, recipient_email, recipient_name, recipient_role, expires_at')

    if (insertErr || !created) {
      logger.error('createConfirmationRequests insert failed', {
        error: insertErr,
        entityId: input.documentId,
      })
      return { success: false, error: 'Kunne ikke oprette bekræftelses-anmodninger' }
    }

    return {
      success: true,
      data: created.map((row) => ({
        confirmationId: row.id,
        token: row.token,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        recipientRole: row.recipient_role as ConfirmationRecipientRole,
        expiresAt: row.expires_at,
      })),
    }
  } catch (err) {
    return {
      success: false,
      error: formatError(err, 'Kunne ikke oprette bekræftelses-anmodninger'),
    }
  }
}

// =====================================================
// 2. getConfirmationContext  (public — bruger createAdminClient)
// =====================================================
/**
 * Public-side initial fetch. Validerer token server-side via service-role
 * (anon kan IKKE laese tabellen direkte). Returnerer curated view-model.
 *
 * Side-effekter: hvis state='awaiting', transitionerer rowen fra 'sent'
 * til 'opened' (idempotent), saetter first_opened_at hvis NULL, og oeger
 * open_count.
 */
export async function getConfirmationContext(
  token: string,
): Promise<ActionResult<PublicConfirmationContext>> {
  try {
    if (!isPlausibleToken(token)) {
      return { success: true, data: buildMinimalView('invalid') }
    }

    const admin = createAdminClient()

    const { data: row, error: rowErr } = await admin
      .from('document_confirmations')
      .select(`
        id, customer_document_id, service_case_id, status, expires_at,
        recipient_email, recipient_name, recipient_role,
        first_opened_at, open_count,
        confirmed_at, confirmed_by_name, confirmed_by_email, confirmation_note
      `)
      .eq('token', token)
      .maybeSingle()

    if (rowErr) {
      logger.error('getConfirmationContext lookup failed', { error: rowErr })
      return { success: false, error: 'Linket kunne ikke valideres' }
    }
    if (!row) {
      return { success: true, data: buildMinimalView('invalid') }
    }

    const state = computePublicState({
      status: row.status as ConfirmationStatus,
      expires_at: row.expires_at,
    })

    // For ikke-aktive states: returnér minimal view-model. Vi vil ikke
    // laekke dokumenttitel/sag/PDF til invalid/revoked/expired tokens.
    if (state !== 'awaiting' && state !== 'already_confirmed') {
      return { success: true, data: buildMinimalView(state, row.expires_at) }
    }

    // Hent dokument-metadata
    const { data: doc } = await admin
      .from('customer_documents')
      .select('title, file_name, storage_path, document_type, service_case_id')
      .eq('id', row.customer_document_id)
      .maybeSingle()

    if (!doc) {
      // Dokument slettet — skulle ikke kunne ske pga ON DELETE CASCADE,
      // men sikkerhedsnet hvis nogen sletter direkte i DB.
      return { success: true, data: buildMinimalView('invalid') }
    }

    // Service case (foretraek snapshot fra confirmation, fallback til dokumentet)
    let serviceCase: PublicConfirmationContext['serviceCase'] = null
    const scId = row.service_case_id || doc.service_case_id
    if (scId) {
      const { data: sc } = await admin
        .from('service_cases')
        .select('case_number, title')
        .eq('id', scId)
        .maybeSingle()
      if (sc) serviceCase = { caseNumber: sc.case_number, title: sc.title }
    }

    // PDF signed URL (kort levetid)
    let pdfUrl: string | null = null
    if (doc.storage_path) {
      const { data: signed } = await admin.storage
        .from('attachments')
        .createSignedUrl(doc.storage_path, PDF_SIGNED_URL_TTL_SECONDS)
      pdfUrl = signed?.signedUrl ?? null
    }

    // Side-effekt: transitionér 'sent' → 'opened' og opdatér open-tracking.
    // Kun for state='awaiting'. WHERE-guard sikrer at vi ikke overskriver
    // confirmed/revoked rows hvis race opstaar.
    if (state === 'awaiting') {
      const newFirstOpened = row.first_opened_at ?? new Date().toISOString()
      const { error: openErr } = await admin
        .from('document_confirmations')
        .update({
          status: 'opened',
          first_opened_at: newFirstOpened,
          last_opened_at: new Date().toISOString(),
          open_count: (row.open_count ?? 0) + 1,
        })
        .eq('id', row.id)
        .in('status', ['sent', 'opened'])
      if (openErr) {
        // Ikke fatalt — log og fortsaet. Audit-tracking er nice-to-have.
        logger.error('open-tracking update failed', {
          error: openErr,
          entityId: row.id,
        })
      }
    }

    const roleLabel =
      RECIPIENT_ROLE_LABELS[row.recipient_role as ConfirmationRecipientRole] ||
      'Modtager'

    return {
      success: true,
      data: {
        state,
        documentTitle: doc.title,
        documentFileName: doc.file_name,
        pdfUrl,
        serviceCase,
        recipientRoleLabel: roleLabel,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        expiresAt: row.expires_at,
        confirmedAt: row.confirmed_at ?? undefined,
        confirmedByName: row.confirmed_by_name ?? undefined,
        confirmedByEmail: row.confirmed_by_email ?? undefined,
        confirmationNote: row.confirmation_note ?? undefined,
      },
    }
  } catch (err) {
    logger.error('getConfirmationContext error', { error: err })
    return { success: false, error: 'Linket kunne ikke valideres' }
  }
}

// =====================================================
// 3. submitConfirmation  (public — bruger createAdminClient + atomic guard)
// =====================================================
/**
 * Registrerer modtagerens bekraeftelse. Atomisk: UPDATE matcher KUN hvis
 * status IN ('sent','opened') AND expires_at > NOW(). Dobbeltklik,
 * udloebne links, allerede bekraeftede, eller revoked rows kommer ikke
 * igennem.
 *
 * Hvis WHERE-guard miss'er, sekundaer lookup forklarer brugeren hvorfor.
 */
export async function submitConfirmation(
  input: SubmitConfirmationInput,
): Promise<ActionResult<{ confirmedAt: string }>> {
  try {
    if (!isPlausibleToken(input.token)) {
      return { success: false, error: 'Linket er ikke gyldigt' }
    }
    if (!input.signerName?.trim()) {
      return { success: false, error: 'Navn er påkrævet' }
    }
    const email = input.signerEmail?.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Gyldig e-mail er påkrævet' }
    }

    const { ip, userAgent } = await getClientMeta()
    const admin = createAdminClient()
    const now = new Date().toISOString()

    // ATOMISK: kun pending→confirmed transition for stale 'sent'/'opened' + non-expired
    const { data: updated, error: updateErr } = await admin
      .from('document_confirmations')
      .update({
        status: 'confirmed',
        confirmed_at: now,
        confirmed_by_name: input.signerName.trim(),
        confirmed_by_email: email,
        confirmation_note: input.note?.trim() || null,
        confirmed_ip: ip,
        confirmed_user_agent: userAgent.slice(0, 512),
      })
      .eq('token', input.token)
      .in('status', ['sent', 'opened'])
      .gt('expires_at', now)
      .select('id, confirmed_at, customer_document_id')
      .maybeSingle()

    if (updateErr) {
      logger.error('submitConfirmation update failed', { error: updateErr })
      return { success: false, error: 'Kunne ikke registrere bekræftelse' }
    }

    if (updated && updated.confirmed_at) {
      logger.info('document confirmation submitted', {
        entity: 'document_confirmations',
        entityId: updated.id,
        metadata: {
          document_id: updated.customer_document_id,
          confirmed_by_email: email,
          ip,
        },
      })
      // Fase 2a — frigiv næste kæde-trin til manuelt videresend (sender IKKE
      // mail). Best-effort; må aldrig vælte den gennemførte bekræftelse.
      await markNextChainStepReady(admin, updated.id)
      return { success: true, data: { confirmedAt: updated.confirmed_at } }
    }

    // Guard miss'ede — find ud af hvorfor og giv venlig fejl
    const { data: row } = await admin
      .from('document_confirmations')
      .select('status, expires_at')
      .eq('token', input.token)
      .maybeSingle()

    if (!row) {
      return { success: false, error: 'Linket er ikke gyldigt' }
    }
    if (row.status === 'confirmed') {
      return { success: false, error: 'Rapporten er allerede bekræftet' }
    }
    if (row.status === 'revoked') {
      return { success: false, error: 'Bekræftelsen er trukket tilbage' }
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { success: false, error: 'Linket er udløbet' }
    }
    if (row.status === 'pending' || row.status === 'failed') {
      return { success: false, error: 'Linket er ikke aktivt' }
    }
    return { success: false, error: 'Bekræftelsen kunne ikke registreres' }
  } catch (err) {
    logger.error('submitConfirmation error', { error: err })
    return { success: false, error: formatError(err, 'Kunne ikke registrere bekræftelse') }
  }
}

// =====================================================
// 4. listConfirmationsForDocument  (authenticated)
// =====================================================
export async function listConfirmationsForDocument(
  documentId: string,
): Promise<ActionResult<ConfirmationListItem[]>> {
  try {
    validateUUID(documentId, 'documentId')
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('document_confirmations')
      .select(`
        id, recipient_email, recipient_name, recipient_role, recipient_type,
        status, expires_at, mail_sent_at, mail_error,
        first_opened_at, last_opened_at, open_count,
        confirmed_at, confirmed_by_name, confirmed_by_email, confirmation_note,
        revoked_at, revoked_reason, created_at, metadata
      `)
      .eq('customer_document_id', documentId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('listConfirmationsForDocument failed', { error, entityId: documentId })
      return { success: false, error: 'Kunne ikke hente bekræftelser' }
    }

    const items = (data ?? []).map(mapToListItem)
    return { success: true, data: items }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente bekræftelser') }
  }
}

// =====================================================
// 5. listConfirmationsForServiceCase  (authenticated)
// =====================================================
export async function listConfirmationsForServiceCase(
  serviceCaseId: string,
): Promise<ActionResult<ConfirmationListItem[]>> {
  try {
    validateUUID(serviceCaseId, 'serviceCaseId')
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('document_confirmations')
      .select(`
        id, recipient_email, recipient_name, recipient_role, recipient_type,
        status, expires_at, mail_sent_at, mail_error,
        first_opened_at, last_opened_at, open_count,
        confirmed_at, confirmed_by_name, confirmed_by_email, confirmation_note,
        revoked_at, revoked_reason, created_at, metadata
      `)
      .eq('service_case_id', serviceCaseId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('listConfirmationsForServiceCase failed', {
        error,
        entityId: serviceCaseId,
      })
      return { success: false, error: 'Kunne ikke hente bekræftelser' }
    }

    const items = (data ?? []).map(mapToListItem)
    return { success: true, data: items }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente bekræftelser') }
  }
}

// =====================================================
// Mail-outcome helpers (authenticated)
// =====================================================
/**
 * Phase A integration: efter Graph-send opdateres confirmation-rowen
 * fra 'pending' til 'sent' (success) eller 'failed' (fejl). Guard paa
 * status='pending' goer kaldet idempotent — kalder man markSent to
 * gange, er anden et no-op.
 */
export async function markConfirmationMailSent(
  confirmationId: string,
): Promise<ActionResult<void>> {
  try {
    validateUUID(confirmationId, 'confirmationId')
    const { supabase } = await getAuthenticatedClient()
    const { error } = await supabase
      .from('document_confirmations')
      .update({ status: 'sent', mail_sent_at: new Date().toISOString() })
      .eq('id', confirmationId)
      .eq('status', 'pending')
    if (error) {
      logger.error('markConfirmationMailSent failed', { error, entityId: confirmationId })
      return { success: false, error: 'Kunne ikke opdatere bekræftelses-status' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere bekræftelses-status') }
  }
}

export async function markConfirmationMailFailed(
  confirmationId: string,
  errorMessage: string,
): Promise<ActionResult<void>> {
  try {
    validateUUID(confirmationId, 'confirmationId')
    const { supabase } = await getAuthenticatedClient()
    const { error } = await supabase
      .from('document_confirmations')
      .update({
        status: 'failed',
        mail_error: (errorMessage || 'mail-send fejlede').slice(0, 1000),
      })
      .eq('id', confirmationId)
      .eq('status', 'pending')
    if (error) {
      logger.error('markConfirmationMailFailed failed', { error, entityId: confirmationId })
      return { success: false, error: 'Kunne ikke opdatere bekræftelses-status' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere bekræftelses-status') }
  }
}

// =====================================================
// 6. revokeConfirmation  (authenticated)
// =====================================================
/**
 * Medarbejder kan annullere en ikke-bekraeftet anmodning. Atomisk:
 * UPDATE matcher kun status IN ('pending','sent','opened','failed').
 * Allerede-bekraeftet eller allerede-revoked giver venlig fejl.
 */
export async function revokeConfirmation(input: {
  confirmationId: string
  reason?: string
}): Promise<ActionResult<void>> {
  try {
    validateUUID(input.confirmationId, 'confirmationId')
    const { supabase, userId } = await getAuthenticatedClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('document_confirmations')
      .update({
        status: 'revoked',
        revoked_at: now,
        revoked_by: userId,
        revoked_reason: input.reason?.trim() || null,
      })
      .eq('id', input.confirmationId)
      .in('status', ['pending', 'sent', 'opened', 'failed'])
      .select('id')
      .maybeSingle()

    if (error) {
      logger.error('revokeConfirmation failed', {
        error,
        entityId: input.confirmationId,
      })
      return { success: false, error: 'Kunne ikke annullere bekræftelses-anmodning' }
    }
    if (!data) {
      const { data: row } = await supabase
        .from('document_confirmations')
        .select('status')
        .eq('id', input.confirmationId)
        .maybeSingle()
      if (!row) return { success: false, error: 'Bekræftelse ikke fundet' }
      if (row.status === 'confirmed') {
        return { success: false, error: 'Allerede bekræftet — kan ikke annulleres' }
      }
      if (row.status === 'revoked') {
        return { success: false, error: 'Allerede annulleret' }
      }
      return { success: false, error: 'Kan ikke annulleres i nuværende status' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke annullere') }
  }
}

// =====================================================
// Internal mapping
// =====================================================
function mapToListItem(r: {
  id: string
  recipient_email: string
  recipient_name: string | null
  recipient_role: string
  recipient_type: string
  status: string
  expires_at: string
  mail_sent_at: string | null
  mail_error: string | null
  first_opened_at: string | null
  last_opened_at: string | null
  open_count: number
  confirmed_at: string | null
  confirmed_by_name: string | null
  confirmed_by_email: string | null
  confirmation_note: string | null
  revoked_at: string | null
  revoked_reason: string | null
  created_at: string
  metadata?: Record<string, unknown> | null
}): ConfirmationListItem {
  const status = r.status as ConfirmationStatus
  const isExpired =
    (status === 'sent' || status === 'opened') &&
    new Date(r.expires_at).getTime() < Date.now()
  const meta = (r.metadata ?? {}) as SequenceMetaShape
  const seq = meta.sequence
  const sequence =
    seq && typeof seq.chainId === 'string' && typeof seq.order === 'number'
      ? { chainId: seq.chainId, order: seq.order, gated: seq.gated === true }
      : null
  return {
    id: r.id,
    recipientEmail: r.recipient_email,
    recipientName: r.recipient_name,
    recipientRole: r.recipient_role as ConfirmationRecipientRole,
    recipientType: r.recipient_type as ConfirmationRecipientType,
    status,
    isExpired,
    expiresAt: r.expires_at,
    mailSentAt: r.mail_sent_at,
    mailError: r.mail_error,
    firstOpenedAt: r.first_opened_at,
    lastOpenedAt: r.last_opened_at,
    openCount: r.open_count,
    confirmedAt: r.confirmed_at,
    confirmedByName: r.confirmed_by_name,
    confirmedByEmail: r.confirmed_by_email,
    confirmationNote: r.confirmation_note,
    revokedAt: r.revoked_at,
    revokedReason: r.revoked_reason,
    createdAt: r.created_at,
    sequence,
    readyToSend: meta.readyToSend === true,
  }
}
