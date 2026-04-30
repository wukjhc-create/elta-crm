/**
 * Invoices (Phase 5)
 *
 * Generate an invoice from an accepted offer and progress it through the
 * draft → sent → paid status flow. All heavy lifting (validation, totals,
 * line copy, idempotency, sequential number allocation) happens inside
 * the SQL function `create_invoice_from_offer`, which runs as a single
 * transaction.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type {
  InvoiceLineRow,
  InvoicePaymentStatus,
  InvoicePdfPayload,
  InvoiceRow,
  InvoiceStatus,
} from '@/types/invoice.types'

export interface CreateInvoiceOptions {
  /** Days from creation until due_date. Default: 14. */
  dueDays?: number
}

/**
 * Create an invoice from an accepted offer.
 *
 *   - Idempotent: if an invoice already exists for the offer, returns its id.
 *   - Validates offer exists and status='accepted' — throws otherwise.
 *   - Copies every offer_line_items row into invoice_lines.
 *   - Allocates F-YYYY-NNNN with row-locked counter.
 */
export async function createInvoiceFromOffer(
  offerId: string,
  options: CreateInvoiceOptions = {}
): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('create_invoice_from_offer', {
    p_offer_id: offerId,
    p_due_days: options.dueDays ?? 14,
  })

  if (error) {
    logger.error('createInvoiceFromOffer failed', {
      entity: 'offers',
      entityId: offerId,
      error,
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('invoice', 'error', `createInvoiceFromOffer: ${error.message}`, { offerId })
    } catch { /* never crash */ }
    throw new Error(`createInvoiceFromOffer failed: ${error.message}`)
  }

  const invoiceId = String(data)
  console.log('INVOICE CREATED:', invoiceId)
  return invoiceId
}

/**
 * Status flow: draft → sent → paid (no skipping, no reverse).
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent'],
  sent: ['paid'],
  paid: [],
}

export async function setInvoiceStatus(
  invoiceId: string,
  next: InvoiceStatus
): Promise<InvoiceRow> {
  const supabase = createAdminClient()

  const { data: current, error: readErr } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .maybeSingle()

  if (readErr || !current) {
    throw new Error(`setInvoiceStatus: invoice ${invoiceId} not found`)
  }

  const cur = current.status as InvoiceStatus
  if (cur === next) {
    const { data: row } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()
    return row as InvoiceRow
  }

  if (!ALLOWED_TRANSITIONS[cur].includes(next)) {
    throw new Error(`setInvoiceStatus: cannot transition ${cur} → ${next}`)
  }

  const patch: Partial<InvoiceRow> = { status: next }
  if (next === 'sent') patch.sent_at = new Date().toISOString()
  if (next === 'paid') patch.paid_at = new Date().toISOString()

  const { data: updated, error: updErr } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', invoiceId)
    .select('*')
    .single()

  if (updErr || !updated) {
    logger.error('setInvoiceStatus update failed', { entityId: invoiceId, error: updErr })
    throw new Error(`setInvoiceStatus update failed: ${updErr?.message ?? 'unknown'}`)
  }

  console.log('INVOICE STATUS:', invoiceId, cur, '→', next)
  return updated as InvoiceRow
}

/**
 * Read an invoice + its lines + customer info as a single bundle ready
 * for PDF rendering. No PDF code yet — just the shape.
 */
export async function getInvoicePdfPayload(
  invoiceId: string
): Promise<InvoicePdfPayload | null> {
  const supabase = createAdminClient()

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr || !invoice) return null

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true })

  let customer: InvoicePdfPayload['customer'] = null
  if (invoice.customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('id, company_name, contact_person, billing_address, billing_postal_code, billing_city, vat_number, email')
      .eq('id', invoice.customer_id)
      .maybeSingle()
    if (c) {
      customer = {
        id: c.id,
        name: c.company_name || c.contact_person || '',
        address: c.billing_address ?? null,
        zip: c.billing_postal_code ?? null,
        city: c.billing_city ?? null,
        cvr: c.vat_number ?? null,
        email: c.email ?? null,
      }
    }
  }

  return {
    invoice: invoice as InvoiceRow,
    lines: (lines ?? []) as InvoiceLineRow[],
    customer,
  }
}

// =====================================================
// Phase 5.1 — Payment + reminder flow
// =====================================================

import {
  buildInvoiceReminderHtml,
  buildInvoiceReminderSubject,
} from '@/lib/email/templates/invoice-reminder-email'

const REMINDER_RULES = [
  { level: 1 as const, minDaysOverdue: 3 },
  { level: 2 as const, minDaysOverdue: 10 },
  { level: 3 as const, minDaysOverdue: 20 },
]

const MIN_DAYS_BETWEEN_REMINDERS = 5
const REMINDER_FROM_MAILBOX = 'kontakt@eltasolar.dk'

/** Move invoice from draft → sent (sets sent_at). */
export async function markInvoiceSent(invoiceId: string): Promise<InvoiceRow> {
  return setInvoiceStatus(invoiceId, 'sent')
}

/** Move invoice from sent → paid (sets paid_at). Optionally records payment_reference. */
export async function markInvoicePaid(
  invoiceId: string,
  paymentReference?: string | null
): Promise<InvoiceRow> {
  const row = await setInvoiceStatus(invoiceId, 'paid')
  if (paymentReference !== undefined) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('invoices')
      .update({ payment_reference: paymentReference })
      .eq('id', invoiceId)
      .select('*')
      .single()
    if (error) {
      logger.warn('markInvoicePaid: payment_reference update failed', {
        entityId: invoiceId,
        error,
      })
      return row
    }
    return data as InvoiceRow
  }
  return row
}

export interface OverdueInvoice extends InvoiceRow {
  days_overdue: number
  next_reminder_level: 1 | 2 | 3 | null
}

/** Returns sent (unpaid) invoices that are at least 3 days past due_date. */
export async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const supabase = createAdminClient()
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 3)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'sent')
    .lte('due_date', cutoffIso)
    .order('due_date', { ascending: true })

  if (error) {
    logger.error('getOverdueInvoices failed', { error })
    return []
  }

  return (data ?? []).map((inv) => {
    const days = inv.due_date ? daysBetween(new Date(inv.due_date), today) : 0
    return {
      ...(inv as InvoiceRow),
      days_overdue: days,
      next_reminder_level: pickReminderLevel(days, (inv as InvoiceRow).reminder_count ?? 0),
    }
  })
}

export interface SendReminderResult {
  invoiceId: string
  status: 'sent' | 'skipped' | 'failed' | 'manual_review'
  level: 1 | 2 | 3 | null
  reason?: string
  error?: string
}

/**
 * Send a payment reminder for an invoice. Safety guards:
 *   - status must be 'sent'
 *   - days_overdue must be ≥ 3
 *   - last_reminder_at must be null OR older than 5 days
 *   - level 3 just queues a manual_review log entry, no email
 */
export async function sendInvoiceReminder(invoiceId: string): Promise<SendReminderResult> {
  const supabase = createAdminClient()

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invErr || !inv) {
    return { invoiceId, status: 'failed', level: null, error: 'invoice not found' }
  }

  const invoice = inv as InvoiceRow

  if (invoice.status !== 'sent') {
    await logReminder(invoiceId, null, 'skipped', null, `status=${invoice.status}`)
    return { invoiceId, status: 'skipped', level: null, reason: `status=${invoice.status}` }
  }

  if (!invoice.due_date) {
    await logReminder(invoiceId, null, 'skipped', null, 'no due_date')
    return { invoiceId, status: 'skipped', level: null, reason: 'no due_date' }
  }

  const today = new Date()
  const days = daysBetween(new Date(invoice.due_date), today)
  const level = pickReminderLevel(days, invoice.reminder_count ?? 0)

  if (level === null) {
    await logReminder(invoiceId, null, 'skipped', null, `not yet due for reminder (days=${days}, count=${invoice.reminder_count})`)
    return {
      invoiceId,
      status: 'skipped',
      level: null,
      reason: `not yet due (days=${days}, count=${invoice.reminder_count})`,
    }
  }

  // 5-day cooldown
  if (invoice.last_reminder_at) {
    const since = daysBetween(new Date(invoice.last_reminder_at), today)
    if (since < MIN_DAYS_BETWEEN_REMINDERS) {
      await logReminder(invoiceId, level, 'skipped', null, `cooldown ${since}d < ${MIN_DAYS_BETWEEN_REMINDERS}d`)
      return { invoiceId, status: 'skipped', level, reason: `cooldown ${since}d` }
    }
  }

  // Level 3 = warning, manual review only — no email.
  if (level === 3) {
    await supabase
      .from('invoices')
      .update({ reminder_count: (invoice.reminder_count ?? 0) + 1, last_reminder_at: today.toISOString() })
      .eq('id', invoiceId)
    await logReminder(invoiceId, 3, 'manual_review', null, `${days} days overdue — escalated`)
    console.log('INVOICE WARNING (manual review):', invoice.invoice_number, days, 'days overdue')
    return { invoiceId, status: 'manual_review', level: 3 }
  }

  // Levels 1 + 2 — send email.
  if (!invoice.customer_id) {
    await logReminder(invoiceId, level, 'skipped', null, 'no customer linked')
    return { invoiceId, status: 'skipped', level, reason: 'no customer linked' }
  }

  const { data: cust } = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email')
    .eq('id', invoice.customer_id)
    .maybeSingle()
  const recipient = cust?.email
  if (!recipient) {
    await logReminder(invoiceId, level, 'skipped', null, 'customer has no email')
    return { invoiceId, status: 'skipped', level, reason: 'customer has no email' }
  }

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) {
    await logReminder(invoiceId, level, 'failed', recipient, null, 'Graph not configured')
    return { invoiceId, status: 'failed', level, error: 'Graph not configured' }
  }

  const params = {
    customerName: cust?.contact_person || cust?.company_name || 'Kunde',
    invoiceNumber: invoice.invoice_number,
    finalAmountFormatted: new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: invoice.currency || 'DKK',
      maximumFractionDigits: 2,
    }).format(Number(invoice.final_amount) || 0),
    dueDateFormatted: invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
      : '',
    daysOverdue: days,
    paymentReference: invoice.payment_reference,
    level,
  } as const

  const result = await sendEmailViaGraph({
    to: recipient,
    subject: buildInvoiceReminderSubject(params),
    html: buildInvoiceReminderHtml(params),
    fromMailbox: REMINDER_FROM_MAILBOX,
  })

  if (!result.success) {
    await logReminder(invoiceId, level, 'failed', recipient, null, result.error || 'send failed')
    return { invoiceId, status: 'failed', level, error: result.error }
  }

  await supabase
    .from('invoices')
    .update({
      reminder_count: (invoice.reminder_count ?? 0) + 1,
      last_reminder_at: today.toISOString(),
    })
    .eq('id', invoiceId)
  await logReminder(invoiceId, level, 'sent', recipient, null)
  console.log('INVOICE REMINDER SENT:', invoice.invoice_number, 'level', level, '→', recipient)
  return { invoiceId, status: 'sent', level }
}

// =====================================================
// internals
// =====================================================

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function pickReminderLevel(daysOverdue: number, currentCount: number): 1 | 2 | 3 | null {
  // Use reminder_count to decide what's "next" — never repeat a level we
  // already sent. count 0 → next is 1, count 1 → next is 2, count 2 → 3.
  for (const rule of REMINDER_RULES) {
    if (rule.level <= currentCount) continue
    if (daysOverdue >= rule.minDaysOverdue) return rule.level
  }
  return null
}

async function logReminder(
  invoiceId: string,
  level: 1 | 2 | 3 | null,
  status: 'sent' | 'skipped' | 'failed' | 'manual_review',
  recipient: string | null,
  reason: string | null,
  error?: string | null
): Promise<void> {
  const supabase = createAdminClient()
  // The log row requires a level; for top-level skips (status mismatch etc.)
  // default to level 1 so the row is still recorded.
  const lvl = level ?? 1
  const { error: insErr } = await supabase.from('invoice_reminder_log').insert({
    invoice_id: invoiceId,
    level: lvl,
    status,
    recipient,
    reason,
    error,
  })
  if (insErr) {
    logger.warn('invoice_reminder_log insert failed', { entityId: invoiceId, error: insErr })
  }
}

// =====================================================
// Phase 5.2 — Invoice send + payment tracking
// =====================================================

import {
  buildInvoiceEmailHtml,
  buildInvoiceEmailSubject,
} from '@/lib/email/templates/invoice-email'

const INVOICE_FROM_MAILBOX = 'kontakt@eltasolar.dk'

export interface SendInvoiceEmailResult {
  invoiceId: string
  status: 'sent' | 'already_sent' | 'failed' | 'skipped'
  recipient?: string
  error?: string
  reason?: string
}

/**
 * Send the initial invoice email and transition the invoice to
 * status='sent'. Idempotent: if already sent, returns 'already_sent'
 * without re-sending.
 */
export async function sendInvoiceEmail(invoiceId: string): Promise<SendInvoiceEmailResult> {
  const supabase = createAdminClient()

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr || !inv) {
    return { invoiceId, status: 'failed', error: 'invoice not found' }
  }
  const invoice = inv as InvoiceRow

  // Safety: never send twice. status='sent' or 'paid' or sent_at populated → skip.
  if (invoice.status !== 'draft' || invoice.sent_at) {
    return { invoiceId, status: 'already_sent', reason: `status=${invoice.status}` }
  }

  if (!invoice.customer_id) {
    return { invoiceId, status: 'skipped', reason: 'no customer linked' }
  }

  const { data: cust } = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email')
    .eq('id', invoice.customer_id)
    .maybeSingle()
  const recipient = cust?.email
  if (!recipient) {
    return { invoiceId, status: 'skipped', reason: 'customer has no email' }
  }

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) {
    return { invoiceId, status: 'failed', error: 'Graph not configured' }
  }

  // Use invoice number as default payment reference if none was set yet.
  const paymentReference = invoice.payment_reference || invoice.invoice_number

  const params = {
    customerName: cust?.contact_person || cust?.company_name || 'Kunde',
    invoiceNumber: invoice.invoice_number,
    finalAmountFormatted: new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: invoice.currency || 'DKK',
      maximumFractionDigits: 2,
    }).format(Number(invoice.final_amount) || 0),
    dueDateFormatted: invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('da-DK', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '',
    paymentReference,
    bankRegNo: process.env.INVOICE_BANK_REG_NO || null,
    bankAccount: process.env.INVOICE_BANK_ACCOUNT || null,
  } as const

  const result = await sendEmailViaGraph({
    to: recipient,
    subject: buildInvoiceEmailSubject(params),
    html: buildInvoiceEmailHtml(params),
    fromMailbox: INVOICE_FROM_MAILBOX,
  })

  if (!result.success) {
    logger.error('sendInvoiceEmail Graph send failed', {
      entityId: invoiceId,
      metadata: { recipient, invoice_number: invoice.invoice_number },
      error: new Error(result.error || 'send failed'),
    })
    return { invoiceId, status: 'failed', recipient, error: result.error }
  }

  // Flip status draft → sent and persist payment_reference if we
  // generated one.
  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      payment_reference: paymentReference,
    })
    .eq('id', invoiceId)
    .eq('status', 'draft') // guard against concurrent send
  if (updErr) {
    logger.warn('sendInvoiceEmail: status update failed (already moved?)', {
      entityId: invoiceId,
      error: updErr,
    })
  }

  console.log('INVOICE SENT:', invoiceId)
  try {
    const { logHealth } = await import('@/lib/services/system-health')
    await logHealth('invoice', 'ok', `invoice sent: ${invoice.invoice_number}`, { invoiceId, recipient })
  } catch { /* never crash */ }

  // Sync to e-conomic (Phase 5.4). Best-effort — never blocks send.
  try {
    const { createInvoiceInEconomic } = await import('@/lib/services/economic-client')
    const econ = await createInvoiceInEconomic(invoiceId)
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      if (econ.status === 'success') {
        await logHealth('economic', 'ok', `invoice synced: ${econ.externalId}`, { invoiceId })
      } else if (econ.status === 'failed') {
        await logHealth('economic', 'error', `invoice sync failed: ${econ.error}`, { invoiceId })
      }
    } catch { /* never crash */ }
  } catch (econErr) {
    const msg = econErr instanceof Error ? econErr.message : String(econErr)
    logger.error('e-conomic invoice sync failed (non-critical)', { entityId: invoiceId, error: econErr instanceof Error ? econErr : new Error(msg) })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('economic', 'error', `invoice sync threw: ${msg}`, { invoiceId })
    } catch { /* never crash */ }
  }

  return { invoiceId, status: 'sent', recipient }
}

/**
 * Convenience: create the invoice from an accepted offer AND immediately
 * send it. Returns the invoice id either way; send errors are surfaced
 * on `emailResult` rather than thrown so a transient Graph failure does
 * not lose the invoice.
 */
export async function createAndSendInvoiceFromOffer(
  offerId: string,
  options: CreateInvoiceOptions = {}
): Promise<{ invoiceId: string; emailResult: SendInvoiceEmailResult }> {
  const invoiceId = await createInvoiceFromOffer(offerId, options)
  const emailResult = await sendInvoiceEmail(invoiceId)
  return { invoiceId, emailResult }
}

// =====================================================
// Phase 7.1 — Invoice from work order
// =====================================================

export interface CreateInvoiceFromWorkOrderOptions {
  /** Days from creation until due_date. Default 14. */
  dueDays?: number
  /** Fallback hourly rate when employees.hourly_rate is null. Default 650. */
  defaultHourlyRate?: number
}

/**
 * Generate an invoice from a completed work order.
 *
 *   - Validates work_order exists AND status='done' (RPC enforces).
 *   - Idempotent: returns existing invoice id if one is linked already
 *     (UNIQUE(work_order_id) + early-return in RPC).
 *   - Time lines: one per employee (hours × rate).
 *   - Material lines: copied from work_orders.source_offer_id when set.
 *   - Marks every billed time_log.invoice_line_id so logs can never be
 *     billed twice.
 *   - 25 % VAT.
 *
 * Throws on RPC failure so callers see real errors.
 */
export async function createInvoiceFromWorkOrder(
  workOrderId: string,
  options: CreateInvoiceFromWorkOrderOptions = {}
): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('create_invoice_from_work_order', {
    p_work_order_id: workOrderId,
    p_due_days: options.dueDays ?? 14,
    p_default_hourly_rate: options.defaultHourlyRate ?? Number(process.env.DEFAULT_HOURLY_RATE ?? 650),
  })

  if (error) {
    logger.error('createInvoiceFromWorkOrder failed', {
      entity: 'work_orders',
      entityId: workOrderId,
      error,
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('invoice', 'error', `createInvoiceFromWorkOrder: ${error.message}`, { workOrderId })
    } catch { /* never crash */ }
    throw new Error(`createInvoiceFromWorkOrder failed: ${error.message}`)
  }

  const invoiceId = String(data)
  console.log('INVOICE FROM WORK ORDER:', workOrderId, '→', invoiceId)
  return invoiceId
}

export interface InvoiceFlowResult {
  triggered: boolean
  invoiceId: string | null
  emailStatus: SendInvoiceEmailResult['status'] | null
  error?: string
}

/**
 * Hook called when an offer transitions to status='accepted'.
 *
 * Idempotency:
 *   - The RPC create_invoice_from_offer enforces UNIQUE(offer_id) on
 *     invoices and returns the existing id if one is already linked.
 *   - sendInvoiceEmail() is itself idempotent (status check + race-safe
 *     UPDATE WHERE status='draft').
 *   - Net effect: safe to call multiple times for the same offer; only
 *     the first call produces a new invoice + a real Graph send.
 *
 * Failure isolation: never throws. Email failures leave the invoice in
 * the DB so it can be re-sent manually; the offer acceptance is never
 * rolled back because of an invoice/email problem.
 */
export async function triggerInvoiceFlowOnAccept(
  offerId: string
): Promise<InvoiceFlowResult> {
  console.log('INVOICE FLOW TRIGGERED FROM OFFER:', offerId)
  try {
    const { invoiceId, emailResult } = await createAndSendInvoiceFromOffer(offerId)
    return {
      triggered: true,
      invoiceId,
      emailStatus: emailResult.status,
      error: emailResult.error,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('triggerInvoiceFlowOnAccept failed', {
      entity: 'offers',
      entityId: offerId,
      error: err instanceof Error ? err : new Error(msg),
    })
    return { triggered: true, invoiceId: null, emailStatus: null, error: msg }
  }
}

export interface RegisterPaymentResult {
  invoiceId: string
  amountPaid: number
  paymentStatus: InvoicePaymentStatus
  fullyPaid: boolean
}

/**
 * Record a payment against an invoice.
 *
 *  - Increments amount_paid.
 *  - payment_status: 0 → pending, 0<x<final → partial, ≥ final → paid.
 *  - When the cumulative amount reaches/exceeds final_amount, also
 *    transitions invoices.status to 'paid' (idempotent — safe to call
 *    on already-paid invoices, returns the current state without
 *    side effects).
 *  - amount must be > 0.
 */
export async function registerPayment(
  invoiceId: string,
  amount: number,
  reference?: string | null
): Promise<RegisterPaymentResult> {
  const amt = Number(amount)
  if (!(amt > 0) || !Number.isFinite(amt)) {
    throw new Error(`registerPayment: amount must be > 0 (got ${amount})`)
  }

  const supabase = createAdminClient()

  const { data: inv, error: readErr } = await supabase
    .from('invoices')
    .select('id, status, payment_status, amount_paid, final_amount, currency')
    .eq('id', invoiceId)
    .maybeSingle()
  if (readErr || !inv) {
    throw new Error(`registerPayment: invoice ${invoiceId} not found`)
  }

  // Safety: never mark paid twice. If payment_status is already 'paid',
  // we still record the audit row but do NOT change status / paid_at.
  const wasAlreadyPaid = inv.payment_status === 'paid'

  // Insert audit row first so the payment is captured even if the
  // subsequent update fails.
  const { error: insErr } = await supabase.from('invoice_payments').insert({
    invoice_id: invoiceId,
    amount: amt,
    reference: reference ?? null,
  })
  if (insErr) {
    logger.error('registerPayment: payment insert failed', {
      entityId: invoiceId,
      error: insErr,
    })
    throw new Error(`registerPayment failed: ${insErr.message}`)
  }

  if (wasAlreadyPaid) {
    console.log('PAYMENT REGISTERED:', invoiceId, amt, '(invoice already paid)')
    return {
      invoiceId,
      amountPaid: Number(inv.amount_paid),
      paymentStatus: 'paid',
      fullyPaid: true,
    }
  }

  const newAmountPaid = round2(Number(inv.amount_paid) + amt)
  const final = Number(inv.final_amount)
  let nextPaymentStatus: InvoicePaymentStatus = 'pending'
  if (newAmountPaid >= final) nextPaymentStatus = 'paid'
  else if (newAmountPaid > 0) nextPaymentStatus = 'partial'

  const patch: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    payment_status: nextPaymentStatus,
  }
  if (reference) patch.payment_reference = reference

  if (nextPaymentStatus === 'paid' && inv.status !== 'paid') {
    patch.status = 'paid'
    patch.paid_at = new Date().toISOString()
  }

  const { error: updErr } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', invoiceId)
  if (updErr) {
    logger.error('registerPayment: invoice update failed', {
      entityId: invoiceId,
      error: updErr,
    })
    throw new Error(`registerPayment update failed: ${updErr.message}`)
  }

  console.log('PAYMENT REGISTERED:', invoiceId, amt)
  try {
    const { logHealth } = await import('@/lib/services/system-health')
    await logHealth('invoice', 'ok', `payment registered: ${amt}`, { invoiceId, paymentStatus: nextPaymentStatus })
  } catch { /* never crash */ }

  if (nextPaymentStatus === 'paid') {
    console.log('INVOICE PAID:', invoiceId)
    // Sync payment to e-conomic. Best-effort.
    try {
      const { markInvoicePaidInEconomic } = await import('@/lib/services/economic-client')
      const econ = await markInvoicePaidInEconomic(invoiceId)
      try {
        const { logHealth } = await import('@/lib/services/system-health')
        if (econ.status === 'success') {
          await logHealth('economic', 'ok', `payment synced: ${econ.externalId}`, { invoiceId })
        } else if (econ.status === 'failed') {
          await logHealth('economic', 'error', `mark-paid failed: ${econ.error}`, { invoiceId })
        }
      } catch { /* never crash */ }
    } catch (econErr) {
      const msg = econErr instanceof Error ? econErr.message : String(econErr)
      logger.error('e-conomic mark-paid sync failed (non-critical)', { entityId: invoiceId, error: econErr instanceof Error ? econErr : new Error(msg) })
      try {
        const { logHealth } = await import('@/lib/services/system-health')
        await logHealth('economic', 'error', `mark-paid threw: ${msg}`, { invoiceId })
      } catch { /* never crash */ }
    }
  }

  return {
    invoiceId,
    amountPaid: newAmountPaid,
    paymentStatus: nextPaymentStatus,
    fullyPaid: nextPaymentStatus === 'paid',
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
