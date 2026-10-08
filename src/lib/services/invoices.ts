/**
 * Invoices (Phase 5)
 *
 * Generate an invoice from an accepted offer and progress it through the
 * draft → sent → paid status flow. All heavy lifting (validation, totals,
 * line copy, idempotency, sequential number allocation) happens inside
 * the SQL function `create_invoice_from_offer`, which runs as a single
 * transaction.
 */

import { MIN_DAYS_BETWEEN_REMINDERS, pickReminderLevel } from '@/lib/invoices/reminder-plan' // regler delt med cockpittet (N89)
import { invoiceBankInfo } from '@/lib/invoices/bank-info'
import { createAdminClient } from '@/lib/supabase/admin'
import { copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'
import { rebaseDueDateOnSend } from '@/lib/invoices/due-date'
import { logger } from '@/lib/utils/logger'
import { getStandardSaleRate } from '@/lib/services/rates'
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
 * Sprint 2E.2A: resolver betalingsfrist (dage) til due_date-beregning.
 * Kæde: customer.payment_terms_days → company_settings.default_payment_terms_days → 14.
 * Bruges kun når caller ikke har angivet options.dueDays (eksplicit override).
 */
async function resolvePaymentTermsDays(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string | null,
): Promise<number> {
  const FALLBACK = 14
  try {
    if (customerId) {
      const { data: c } = await supabase
        .from('customers')
        .select('payment_terms_days')
        .eq('id', customerId)
        .maybeSingle()
      // 0 = omgående betaling (gyldig) → returneres. NULL/undefined = arv
      // company-default → springes over. typeof-check (ikke Number(), da
      // Number(null) === 0 fejlagtigt ville give omgående for NULL-kunder).
      const v = c?.payment_terms_days
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
    }
    const { data: cs } = await supabase
      .from('company_settings')
      .select('default_payment_terms_days')
      .maybeSingle()
    const d = cs?.default_payment_terms_days
    if (typeof d === 'number' && Number.isFinite(d) && d >= 0) return d
    return FALLBACK
  } catch {
    return FALLBACK
  }
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

  // Faktura-review 2026-10-04 (HØJ): SQL-funktionen create_invoice_from_offer summerer sale_price/unit_price × antal og
  // ignorerer linjerabat og tilbudsrabat → et tilbud med rabat ville blive faktureret til fuld pris (og automatik-reglen
  // sender den). Indtil funktionen er rettet (migration → godkendelse) afvises rabat-tilbud her; de faktureres manuelt.
  const { data: existing } = await supabase.from('invoices').select('id').eq('offer_id', offerId).limit(1)
  if (!existing?.length) {
    const [{ data: off }, { count: discountedLines }] = await Promise.all([
      supabase.from('offers').select('discount_percentage, discount_amount').eq('id', offerId).maybeSingle(),
      supabase.from('offer_line_items').select('id', { count: 'exact', head: true }).eq('offer_id', offerId).gt('discount_percentage', 0),
    ])
    if (Number(off?.discount_percentage) > 0 || Number(off?.discount_amount) > 0 || (discountedLines ?? 0) > 0) {
      throw new Error('Tilbuddet har rabat — automatisk faktura fra tilbud medregner ikke rabat endnu. Opret fakturaen manuelt.')
    }
    // S1 (tilbuds-review 2026-10-07): SQL-funktionen prissætter med COALESCE(sale_price, unit_price, 0), men sale_price
    // er NOT NULL DEFAULT 0, og manuelt oprettede/redigerede linjer gemte kun unit_price → linjen blev faktureret (og
    // automatik-reglen SENDT) til 0 kr eller en forældet pris. Afvis indtil linjerne er rettet (prod-data → godkendelse).
    const { data: priceLines } = await supabase.from('offer_line_items').select('sale_price, unit_price').eq('offer_id', offerId)
    const mispriced = ((priceLines ?? []) as Array<{ sale_price: number | string | null; unit_price: number | string | null }>)
      .filter((l) => Number(l.unit_price ?? 0) !== 0 && Number(l.sale_price ?? 0) !== Number(l.unit_price ?? 0)).length
    if (mispriced > 0) {
      throw new Error(`Tilbuddet har ${mispriced} linje(r) hvor fakturaprisen ikke svarer til tilbudsprisen — automatisk faktura fra tilbud afvist. Opret fakturaen manuelt.`)
    }
  }

  // Sprint 2E.2A: resolver betalingsfrist (customer → company → 14) når
  // caller ikke har angivet en eksplicit override.
  let dueDays = options.dueDays
  if (dueDays === undefined) {
    const { data: offer } = await supabase
      .from('offers')
      .select('customer_id')
      .eq('id', offerId)
      .maybeSingle()
    dueDays = await resolvePaymentTermsDays(supabase, offer?.customer_id ?? null)
  }

  const { data, error } = await supabase.rpc('create_invoice_from_offer', {
    p_offer_id: offerId,
    p_due_days: dueDays,
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

/**
 * Sprint 6F-3 fix — recompute void-status on a credit note's original.
 *
 * Called when a credit note transitions to/from sent/paid OR when a
 * draft credit note is deleted. The contract:
 *   - Original is voided ONLY when sum of FINALIZED (sent + paid)
 *     credit notes on it ≥ original.final_amount.
 *   - Drafts NEVER trigger void.
 *   - This function is idempotent: it sets voided_at if missing AND
 *     finalized credits cover the original, or clears voided_at if
 *     it was set but no longer should be (self-healing).
 *
 * Best-effort: never throws. Logs warnings on FK errors.
 */
/** sent_at-markør mens en kladde slettes (blokerer samtidig afsendelse, som kræver sent_at IS NULL) */
const DRAFT_DELETE_CLAIM = '1970-01-01T00:00:00.000Z'

async function recomputeOriginalVoidStatus(
  originalInvoiceId: string,
  approverId: string | null
): Promise<void> {
  const supabase = createAdminClient()

  const { data: original } = await supabase
    .from('invoices')
    .select('id, final_amount, voided_at')
    .eq('id', originalInvoiceId)
    .maybeSingle()
  if (!original) return

  const origFinal = Number((original as { final_amount: number | string }).final_amount)
  if (!Number.isFinite(origFinal) || origFinal <= 0) return

  // Only count credit notes that are FINALIZED (sent or paid).
  // Drafts must not contribute to voiding.
  const { data: finalizedCredits } = await supabase
    .from('invoices')
    .select('final_amount, status')
    .eq('credit_of_invoice_id', originalInvoiceId)
    .eq('invoice_type', 'credit')
    .in('status', ['sent', 'paid'])

  let creditedAbsIncl = 0
  for (const c of (finalizedCredits ?? []) as Array<{ final_amount: number | string }>) {
    creditedAbsIncl += Math.abs(Number(c.final_amount))
  }

  const currentlyVoided = !!(original as { voided_at: string | null }).voided_at
  const shouldBeVoided = creditedAbsIncl + 0.005 >= origFinal

  if (shouldBeVoided && !currentlyVoided) {
    const { error } = await supabase
      .from('invoices')
      .update({
        voided_at: new Date().toISOString(),
        voided_by: approverId,
      })
      .eq('id', originalInvoiceId)
      .is('voided_at', null)
    if (error) {
      logger.warn('recomputeOriginalVoidStatus: void-set failed', {
        entityId: originalInvoiceId,
        error,
      })
    }
  } else if (!shouldBeVoided && currentlyVoided) {
    // Self-healing — clear stale voided_at when finalized credits no
    // longer cover the original (e.g. a draft was deleted that had
    // erroneously triggered an old version of the auto-void).
    const { error } = await supabase
      .from('invoices')
      .update({
        voided_at: null,
        voided_by: null,
      })
      .eq('id', originalInvoiceId)
    if (error) {
      logger.warn('recomputeOriginalVoidStatus: void-clear failed', {
        entityId: originalInvoiceId,
        error,
      })
    }
  }
}

export async function setInvoiceStatus(
  invoiceId: string,
  next: InvoiceStatus
): Promise<InvoiceRow> {
  const supabase = createAdminClient()

  const { data: current, error: readErr } = await supabase
    .from('invoices')
    .select('id, status, created_at, due_date')
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
  if (next === 'sent') {
    patch.sent_at = new Date().toISOString()
    // X1: betalingsbetingelserne regnes fra udstedelsen (også ved manuel "markér som sendt")
    if (cur === 'draft') {
      const rebased = rebaseDueDateOnSend((current as { created_at?: string | null }).created_at, (current as { due_date?: string | null }).due_date)
      if (rebased) patch.due_date = rebased
    }
  }
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

  // Sprint 6F-3 fix — when a credit note transitions to a finalized
  // status (sent or paid), recompute void on its original. Voiding
  // happens only when finalized credits cover the original total.
  const updatedRow = updated as InvoiceRow
  if (
    (next === 'sent' || next === 'paid') &&
    updatedRow.invoice_type === 'credit' &&
    updatedRow.credit_of_invoice_id
  ) {
    await recomputeOriginalVoidStatus(updatedRow.credit_of_invoice_id, null)
  }

  console.log('INVOICE STATUS:', invoiceId, cur, '→', next)
  return updatedRow
}

/**
 * Sprint 6B-4 — delete a draft invoice and release every source-row
 * lock so the timer/material/cost can be billed again later.
 *
 * Strict: only status='draft' is deletable. Anything else throws.
 *
 * Steps (no transaction; FK ON DELETE rules backstop):
 *   1. Read invoice header — must be status='draft'
 *   2. Read invoice_lines — collect their ids
 *   3. UPDATE time_logs           SET invoice_line_id = NULL
 *      WHERE invoice_line_id IN (lines)
 *   4. UPDATE case_materials      SET invoice_line_id = NULL  (same)
 *   5. UPDATE case_other_costs    SET invoice_line_id = NULL  (same)
 *   6. DELETE invoice_lines WHERE invoice_id = id
 *   7. DELETE invoices WHERE id = id AND status = 'draft' (race-safe)
 *
 * If step 7 fails (status changed concurrently), the FK rows from
 * 3-5 stay NULL — they're orphaned forwards but the invoice still
 * exists with broken provenance. We catch and rethrow with detail.
 */
/**
 * Sprint Ø3.3 — summary returned to the caller so the action-layer can
 * write a persistent audit_logs entry (with the authenticated user) for
 * the delete + the source-row unlock counts. Cost-free: sale total only.
 */
export type DeleteInvoiceDraftSummary = {
  invoice_number: string
  invoice_type: string | null
  case_id: string | null
  final_amount: number
  unlocked_time_logs: number
  unlocked_materials: number
  unlocked_other: number
}

export async function deleteInvoiceDraft(
  invoiceId: string
): Promise<DeleteInvoiceDraftSummary> {
  const supabase = createAdminClient()

  const { data: inv, error: readErr } = await supabase
    .from('invoices')
    .select(
      'id, status, invoice_number, invoice_type, credit_of_invoice_id, case_id, final_amount'
    )
    .eq('id', invoiceId)
    .maybeSingle()
  if (readErr || !inv) {
    throw new Error(`deleteInvoiceDraft: invoice ${invoiceId} not found`)
  }
  if (inv.status !== 'draft') {
    throw new Error(
      `deleteInvoiceDraft: invoice ${inv.invoice_number} is ${inv.status} — only drafts can be deleted`
    )
  }
  // Økonomi-review 2026-10-08 (#9): kladden kunne slettes MENS sendInvoiceEmail sendte den (kravet = sent_at sat) →
  // kunden fik en faktura der ikke findes, og timer/materialer blev frigivet til ny fakturering. Sletningen tager nu
  // samme krav (sent_at = DRAFT_DELETE_CLAIM) — en igangværende afsendelse blokerer sletning og omvendt.
  const { data: delClaim } = await supabase
    .from('invoices')
    .update({ sent_at: DRAFT_DELETE_CLAIM })
    .eq('id', invoiceId)
    .eq('status', 'draft')
    .is('sent_at', null)
    .select('id')
    .maybeSingle()
  if (!delClaim) {
    throw new Error(`deleteInvoiceDraft: invoice ${inv.invoice_number} sendes netop nu — kan ikke slettes`)
  }
  const releaseDeleteClaim = async () => {
    await supabase.from('invoices').update({ sent_at: null }).eq('id', invoiceId).eq('sent_at', DRAFT_DELETE_CLAIM)
  }
  // Capture credit-link before delete so we can recompute the original
  // invoice's void state afterward (Sprint 6F-3 fix).
  const isCreditOf = (
    inv as { invoice_type?: string; credit_of_invoice_id?: string | null }
  )
  const creditOriginalId =
    isCreditOf.invoice_type === 'credit' ? isCreditOf.credit_of_invoice_id ?? null : null

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('id')
    .eq('invoice_id', invoiceId)
  const lineIds = (lines ?? []).map((l) => l.id as string)

  // Sprint Ø3.3 — count released source-rows per kind for the audit trail.
  let unlockedTimeLogs = 0
  let unlockedMaterials = 0
  let unlockedOther = 0

  if (lineIds.length > 0) {
    // Release forward-link locks on every source kind. `.select('id')`
    // returns the affected rows so we can record how many were unlocked.
    const { data: relTime } = await supabase
      .from('time_logs')
      .update({ invoice_line_id: null })
      .in('invoice_line_id', lineIds)
      .select('id')
    unlockedTimeLogs = (relTime ?? []).length
    const { data: relMat } = await supabase
      .from('case_materials')
      .update({ invoice_line_id: null })
      .in('invoice_line_id', lineIds)
      .select('id')
    unlockedMaterials = (relMat ?? []).length
    const { data: relOther } = await supabase
      .from('case_other_costs')
      .update({ invoice_line_id: null })
      .in('invoice_line_id', lineIds)
      .select('id')
    unlockedOther = (relOther ?? []).length

    const { error: lineDelErr } = await supabase
      .from('invoice_lines')
      .delete()
      .eq('invoice_id', invoiceId)
    if (lineDelErr) {
      logger.error('deleteInvoiceDraft: line delete failed', {
        entityId: invoiceId,
        error: lineDelErr,
      })
      await releaseDeleteClaim()
      throw new Error(`deleteInvoiceDraft: line delete failed: ${lineDelErr.message}`)
    }
  }

  const { error: hdrDelErr, count } = await supabase
    .from('invoices')
    .delete({ count: 'exact' })
    .eq('id', invoiceId)
    .eq('status', 'draft')
  if (hdrDelErr) {
    logger.error('deleteInvoiceDraft: header delete failed', {
      entityId: invoiceId,
      error: hdrDelErr,
    })
    await releaseDeleteClaim()
    throw new Error(`deleteInvoiceDraft: header delete failed: ${hdrDelErr.message}`)
  }
  if ((count ?? 0) === 0) {
    throw new Error(
      `deleteInvoiceDraft: invoice ${invoiceId} no longer in draft state (race) — source locks have been released but header was not deleted`
    )
  }

  console.log('INVOICE DRAFT DELETED:', invoiceId, inv.invoice_number)

  // Sprint 6F-3 fix — if we just deleted a credit draft, recompute the
  // original's void state. Self-healing: clears any stale voided_at
  // that was set by an older buggy code-path (where draft credit
  // erroneously triggered void). Idempotent — does nothing if the
  // original wasn't voided or if other finalized credits still cover
  // it.
  if (creditOriginalId) {
    await recomputeOriginalVoidStatus(creditOriginalId, null)
  }

  return {
    invoice_number: inv.invoice_number as string,
    invoice_type: (inv.invoice_type as string | null) ?? null,
    case_id: (inv.case_id as string | null) ?? null,
    final_amount: Number(inv.final_amount ?? 0),
    unlocked_time_logs: unlockedTimeLogs,
    unlocked_materials: unlockedMaterials,
    unlocked_other: unlockedOther,
  }
}

/**
 * Read an invoice + its lines + customer + sag info + totals as a single
 * bundle ready for PDF rendering.
 *
 * Sprint 6C: extended with `case` (case_number + project_name for PDF
 * header) and computed `totals` (subtotal/vat/final). Totals are
 * defensive — recomputed from the lines so the PDF cannot show a
 * different total than the lines actually sum to.
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

  const inv = invoice as InvoiceRow

  const [linesRes, customerRes, caseRes] = await Promise.all([
    supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true }),
    inv.customer_id
      ? supabase
          .from('customers')
          .select('id, company_name, contact_person, billing_address, billing_postal_code, billing_city, vat_number, email')
          .eq('id', inv.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    inv.case_id
      ? supabase
          .from('service_cases')
          .select('id, case_number, title, project_name')
          .eq('id', inv.case_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const lines = (linesRes.data ?? []) as InvoiceLineRow[]

  let customer: InvoicePdfPayload['customer'] = null
  const c = customerRes.data as
    | {
        id: string
        company_name: string | null
        contact_person: string | null
        billing_address: string | null
        billing_postal_code: string | null
        billing_city: string | null
        vat_number: string | null
        email: string | null
      }
    | null
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

  const caseRow = caseRes.data as
    | { id: string; case_number: string; title: string | null; project_name: string | null }
    | null

  // Sprint 6D-4: load forgængere når denne faktura er final.
  // Pulles i samme funktion (sekventielt efter første parallel) så
  // PDF + detail-side får ét fælles payload-objekt.
  let predecessors: NonNullable<InvoicePdfPayload['predecessors']> = []
  if ((inv as { is_final_invoice?: boolean }).is_final_invoice) {
    const { data: predLinks } = await supabase
      .from('invoice_predecessors')
      .select('predecessor_invoice_id, deduction_amount')
      .eq('invoice_id', invoiceId)
    const predIds = (predLinks ?? []).map(
      (r) => r.predecessor_invoice_id as string
    )
    if (predIds.length > 0) {
      const { data: predRows } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, stage_label, status')
        .in('id', predIds)
      const byId = new Map(
        ((predRows ?? []) as Array<{
          id: string
          invoice_number: string
          invoice_type: string
          stage_label: string | null
          status: string
        }>).map((p) => [p.id, p])
      )
      type PredType = NonNullable<InvoicePdfPayload['predecessors']>[number]
      for (const link of predLinks ?? []) {
        const p = byId.get(link.predecessor_invoice_id as string)
        if (!p) continue
        const row: PredType = {
          predecessor_invoice_id: p.id,
          predecessor_invoice_number: p.invoice_number,
          predecessor_invoice_type: p.invoice_type as PredType['predecessor_invoice_type'],
          predecessor_stage_label: p.stage_label,
          predecessor_status: p.status as PredType['predecessor_status'],
          deduction_amount: Number(link.deduction_amount),
        }
        predecessors.push(row)
      }
    }
  }

  // Sprint 6F-4 — Kreditnota: hent original fakturanummer til PDF-header.
  let creditOfInvoiceNumber: string | null = null
  if (
    inv.invoice_type === 'credit' &&
    inv.credit_of_invoice_id
  ) {
    const { data: orig } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('id', inv.credit_of_invoice_id)
      .maybeSingle()
    if (orig?.invoice_number) {
      creditOfInvoiceNumber = orig.invoice_number as string
    }
  }

  // Recompute totals from lines defensively. If they disagree with
  // invoices.total_amount/tax_amount/final_amount, the line-derived
  // numbers win — the PDF must never show a total that doesn't match
  // the sum of its lines.
  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.total_price) || 0),
    0
  )
  const r2 = (n: number) => Math.round(n * 100) / 100
  const headerVat = Number(inv.tax_amount) || 0
  const headerSubtotal = Number(inv.total_amount) || 0
  // Derive vat_rate from header (default 25 % if header is empty)
  const vatRate =
    headerSubtotal > 0 ? r2((headerVat / headerSubtotal) * 100) : 25
  const vat = r2(subtotal * (vatRate / 100))
  const final = r2(subtotal + vat)

  return {
    invoice: inv,
    lines,
    customer,
    case: caseRow,
    totals: {
      subtotal: r2(subtotal),
      vat,
      final,
      vat_rate: vatRate,
    },
    predecessors,
    credit_of_invoice_number: creditOfInvoiceNumber,
  }
}

// =====================================================
// Phase 5.1 — Payment + reminder flow
// =====================================================

import {
  buildInvoiceReminderHtml,
  buildInvoiceReminderSubject,
} from '@/lib/email/templates/invoice-reminder-email'

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

/**
 * Mail-review 2026-10-07 (R-MAIL-B #3): udestående på en faktura inkl. moms = final_amount − amount_paid − sendte/
 * betalte kreditnotaer mod fakturaen (credit_of_invoice_id). Rykkeren viste før ALTID det fulde beløb — også efter
 * delbetaling eller delkreditering — og blev sendt selv når intet stod udestående.
 */
async function outstandingByInvoice(
  supabase: ReturnType<typeof createAdminClient>,
  invoices: Array<{ id: string; final_amount: number | string | null; amount_paid?: number | string | null }>,
): Promise<Map<string, number>> {
  const credited = new Map<string, number>()
  const ids = invoices.map((i) => i.id)
  for (let k = 0; k < ids.length; k += 200) {
    const { data } = await supabase.from('invoices').select('credit_of_invoice_id, final_amount')
      .in('credit_of_invoice_id', ids.slice(k, k + 200)).in('status', ['sent', 'paid'])
    for (const c of (data ?? []) as Array<{ credit_of_invoice_id: string; final_amount: number | string | null }>) {
      credited.set(c.credit_of_invoice_id, (credited.get(c.credit_of_invoice_id) ?? 0) + Math.abs(Number(c.final_amount) || 0))
    }
  }
  const out = new Map<string, number>()
  for (const i of invoices) {
    const v = (Number(i.final_amount) || 0) - (Number(i.amount_paid) || 0) - (credited.get(i.id) ?? 0)
    out.set(i.id, Math.round(v * 100) / 100)
  }
  return out
}

export interface OverdueInvoice extends InvoiceRow {
  days_overdue: number
  next_reminder_level: 1 | 2 | 3 | null
  /** Udestående inkl. moms (efter delbetalinger og kreditnotaer) */
  outstanding_amount: number
}

/** Returns sent (unpaid) invoices that are at least 3 days past due_date. */
export async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const supabase = createAdminClient()
  const today = new Date()
  // X1: dansk kalenderdato (før toISOString().slice(0,10) = UTC-dato → mellem kl. 00 og 02 dansk tid en dag forskudt)
  const cutoffIso = copenhagenDatePlusDays(-3, today)

  // Sprint 6F-4 — reminder-skip:
  //   - voided_at IS NOT NULL  → fakturaen er annulleret via kreditnota
  //   - invoice_type='credit'  → en kreditnota skal aldrig modtage rykker
  //   - final_amount <= 0      → ingen aktiv fordring
  // .or() håndterer null-safety for invoice_type (gamle rows uden kolonne).
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'sent')
    .lte('due_date', cutoffIso)
    .is('voided_at', null)
    .gt('final_amount', 0)
    .or('invoice_type.is.null,invoice_type.neq.credit')
    .order('due_date', { ascending: true })

  if (error) {
    logger.error('getOverdueInvoices failed', { error })
    return []
  }

  const rows = (data ?? []) as InvoiceRow[]
  const outstanding = await outstandingByInvoice(supabase, rows)
  // kun fakturaer med reelt udestående (> 0,50 kr — øreafrunding)
  return rows.filter((inv) => (outstanding.get(inv.id) ?? 0) > 0.5).map((inv) => {
    const days = inv.due_date ? daysBetween(new Date(inv.due_date), today) : 0
    return {
      ...inv,
      days_overdue: days,
      next_reminder_level: pickReminderLevel(days, inv.reminder_count ?? 0),
      outstanding_amount: outstanding.get(inv.id) ?? 0,
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

  // Sprint 6F-4 — defense-in-depth: skip selv hvis cron-listen er forbi-filtreret.
  // Disse vagter beskytter også eksterne kald til sendInvoiceReminder (f.eks. fra
  // automation rule-engine eller fremtidige API-endpoints).
  if (invoice.voided_at) {
    await logReminder(invoiceId, null, 'skipped', null, 'voided')
    return { invoiceId, status: 'skipped', level: null, reason: 'voided' }
  }
  if (invoice.invoice_type === 'credit') {
    await logReminder(invoiceId, null, 'skipped', null, 'credit_note')
    return { invoiceId, status: 'skipped', level: null, reason: 'credit_note' }
  }
  if (Number(invoice.final_amount) <= 0) {
    await logReminder(invoiceId, null, 'skipped', null, 'final_amount<=0')
    return { invoiceId, status: 'skipped', level: null, reason: 'final_amount<=0' }
  }

  if (!invoice.due_date) {
    await logReminder(invoiceId, null, 'skipped', null, 'no due_date')
    return { invoiceId, status: 'skipped', level: null, reason: 'no due_date' }
  }
  // R-MAIL-B #8: et krav uden afsendelse (kørslen blev afbrudt mellem krav og mail) må ikke forbruge et rykkerniveau
  await reconcileOrphanReminderClaim(supabase, invoice)
  // R-MAIL-B #3: rykkeren gælder det UDESTÅENDE (delbetaling/delkreditering); intet udestående → ingen rykker
  const outstandingAmount = (await outstandingByInvoice(supabase, [invoice])).get(invoice.id) ?? 0
  if (outstandingAmount <= 0.5) {
    await logReminder(invoiceId, null, 'skipped', null, 'outstanding<=0')
    return { invoiceId, status: 'skipped', level: null, reason: 'outstanding<=0' }
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
    // automatik-review: betinget af den læste tæller (samtidige kørsler eskalerer kun én gang)
    const { data: esc } = await supabase
      .from('invoices')
      .update({ reminder_count: (invoice.reminder_count ?? 0) + 1, last_reminder_at: today.toISOString() })
      .eq('id', invoiceId)
      .eq('reminder_count', invoice.reminder_count ?? 0)
      .select('id')
      .maybeSingle()
    if (!esc) return { invoiceId, status: 'skipped', level: 3, reason: 'claimed by parallel run' }
    await logReminder(invoiceId, 3, 'manual_review', null, `${days} days overdue — escalated`)
    console.log('INVOICE WARNING (manual review):', invoice.invoice_number, days, 'days overdue')
    return { invoiceId, status: 'manual_review', level: 3 }
  }

  // Levels 1 + 2 — send email.
  if (!invoice.customer_id) {
    await logReminder(invoiceId, level, 'skipped', null, 'no customer linked')
    return { invoiceId, status: 'skipped', level, reason: 'no customer linked' }
  }

  // Sprint 8H Phase 2: central mail-router med isReminder=true.
  // Prefererer billing_contact, fallback til customer.email.
  const { resolveInvoiceMailRoute, logMailRoute } = await import(
    '@/lib/actions/mail-route-resolvers'
  )
  const routeResult = await resolveInvoiceMailRoute(invoiceId, {
    isReminder: true,
    fromMailboxOverride: REMINDER_FROM_MAILBOX,
  })
  if (!routeResult.ok || !routeResult.route) {
    await logReminder(
      invoiceId,
      level,
      'skipped',
      null,
      routeResult.error || 'routing failed'
    )
    return {
      invoiceId,
      status: 'skipped',
      level,
      reason: routeResult.error || 'routing failed',
    }
  }
  const route = routeResult.route
  const recipient = route.toEmail

  // Hent kunde-metadata til template
  const { data: cust } = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email')
    .eq('id', invoice.customer_id)
    .maybeSingle()

  // Sprint Ø3.7 — firmainfo + redigerbar rykker-template (direkte via admin-
  // client, så cron uden bruger ikke fejler på permission). NULL → fallback.
  const { parseInvoiceEmailConfig } = await import('@/lib/email/invoice-email-config')
  const { data: companyRow } = await supabase
    .from('company_settings')
    .select('company_name, company_email, company_phone, invoice_email_config')
    .maybeSingle()
  const emailCfg = parseInvoiceEmailConfig(companyRow?.invoice_email_config)
  let reminderCaseNumber: string | null = null
  if (invoice.case_id) {
    const { data: sc } = await supabase
      .from('service_cases')
      .select('case_number')
      .eq('id', invoice.case_id)
      .maybeSingle()
    reminderCaseNumber = (sc?.case_number as string | null) ?? null
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
    }).format(outstandingAmount),
    dueDateFormatted: invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'long', year: 'numeric' })
      : '',
    daysOverdue: days,
    paymentReference: invoice.payment_reference,
    level,
    companyName: companyRow?.company_name ?? null,
    companyEmail: companyRow?.company_email ?? null,
    companyPhone: companyRow?.company_phone ?? null,
    caseNumber: reminderCaseNumber,
  } as const

  // Automatik-review: rykkeren "gøres krav på" FØR afsendelse — samtidige kørsler (cron + "Kør rykkere nu", dobbeltklik)
  // læste før samme cooldown og sendte begge. Kun den kørsel der hæver tælleren fra den læste værdi sender; fejler
  // afsendelsen, rulles kravet tilbage.
  const prevCount = invoice.reminder_count ?? 0
  const { data: claim } = await supabase
    .from('invoices')
    .update({ reminder_count: prevCount + 1, last_reminder_at: today.toISOString() })
    .eq('id', invoiceId)
    .eq('reminder_count', prevCount)
    .select('id')
    .maybeSingle()
  if (!claim) {
    await logReminder(invoiceId, level, 'skipped', recipient, 'claimed by parallel run')
    return { invoiceId, status: 'skipped', level, reason: 'claimed by parallel run' }
  }
  // Mail-review 2026-10-08 (#1): log-række "på vej" FØR afsendelsen. Blev funktionen dræbt efter at Graph tog mailen,
  // men før 'sent' blev logget, genoprettede reparationen niveauet → samme rykker igen dagen efter. En in_flight-række
  // tæller som brugt (hellere en manglende rykker end en dublet); den opdateres til det endelige udfald nedenfor.
  const { data: inflight } = await supabase.from('invoice_reminder_log')
    .insert({ invoice_id: invoiceId, level, status: 'failed', recipient, reason: REMINDER_INFLIGHT_REASON, error: null })
    .select('id').single()
  const inflightId = (inflight as { id: string } | null)?.id ?? null
  const finishLog = async (status: 'sent' | 'failed', reason: string | null, error: string | null) => {
    if (inflightId) {
      await supabase.from('invoice_reminder_log').update({ status, reason, error }).eq('id', inflightId)
    } else {
      await logReminder(invoiceId, level, status, recipient, reason, error)
    }
  }

  const result = await sendEmailViaGraph({
    to: recipient,
    subject: buildInvoiceReminderSubject(params, emailCfg),
    html: buildInvoiceReminderHtml(params, emailCfg),
    fromMailbox: REMINDER_FROM_MAILBOX,
    senderName: emailCfg.sender_name?.trim() || undefined,
    replyTo: emailCfg.reply_to?.trim() || undefined,
  })

  if (!result.success) {
    // R-MAIL-B #6: ved ukendt udfald (timeout) beholdes kravet — hellere én manglende rykker end en dublet
    if (!result.uncertain) await supabase
      .from('invoices')
      .update({ reminder_count: prevCount, last_reminder_at: invoice.last_reminder_at ?? null })
      .eq('id', invoiceId)
      .eq('reminder_count', prevCount + 1)
    await finishLog('failed', result.uncertain ? REMINDER_UNCERTAIN_REASON : null, result.error || 'send failed')
    await logMailRoute(route, 'failed', { invoiceId, level, error: result.error })
    return { invoiceId, status: 'failed', level, error: result.error }
  }

  await finishLog('sent', null, null)
  await logMailRoute(route, 'sent', { invoiceId, level, messageId: result.messageId })
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

/** Logårsag for en afsendelse med ukendt udfald (Graph-timeout): niveauet regnes som brugt — ingen genafsendelse. */
const REMINDER_UNCERTAIN_REASON = 'uncertain_timeout'
/** Logårsag for en rykker der er ved at blive sendt (skrives før Graph); efterlades kun hvis kørslen dræbes → brugt */
const REMINDER_INFLIGHT_REASON = 'in_flight'
/** Et krav ældre end dette uden log-række regnes som afbrudt (ikke en kørsel i gang) */
const REMINDER_CLAIM_STALE_MS = 15 * 60_000

/**
 * R-MAIL-B #8 (Henrik 2026-10-08): reminder_count hæves FØR mailen (krav mod dobbelt-send). Afbrydes kørslen før
 * logReminder, er niveauet brugt uden at kunden fik noget. Brugte niveauer = log-rækker 'sent' + 'failed' med ukendt
 * udfald (de må ikke sendes igen). Er reminder_count højere, og kravet er ældre end 15 min, rettes tælleren betinget
 * tilbage (og fakturaobjektet opdateres i hukommelsen), så niveauet kan sendes ved næste kørsel. Ingen skemaændring.
 */
async function reconcileOrphanReminderClaim(supabase: ReturnType<typeof createAdminClient>, invoice: InvoiceRow): Promise<void> {
  const claimed = invoice.reminder_count ?? 0
  if (claimed <= 0 || !invoice.last_reminder_at) return
  if (Date.now() - new Date(invoice.last_reminder_at).getTime() < REMINDER_CLAIM_STALE_MS) return
  const { data: logs } = await supabase.from('invoice_reminder_log').select('status, reason, created_at')
    .eq('invoice_id', invoice.id).in('status', ['sent', 'failed', 'manual_review']).order('created_at', { ascending: false })
  // Mail-review 2026-10-08 (#3): eskalering (niveau 3) logges som manual_review — talte ikke med, så tælleren blev
  // rullet 3 → 2 hver dag og eskaleret igen
  const used = ((logs ?? []) as Array<{ status: string; reason: string | null; created_at: string }>)
    .filter((l) => l.status === 'sent' || l.status === 'manual_review' || l.reason === REMINDER_UNCERTAIN_REASON || l.reason === REMINDER_INFLIGHT_REASON)
  if (used.length >= claimed) return
  const restoredAt = used[0]?.created_at ?? null
  const { data: fixed } = await supabase.from('invoices')
    .update({ reminder_count: used.length, last_reminder_at: restoredAt })
    .eq('id', invoice.id).eq('reminder_count', claimed).select('id').maybeSingle()
  if (fixed) {
    logger.warn('invoice reminder: afbrudt krav genoprettet', { entityId: invoice.id, metadata: { from: claimed, to: used.length } })
    invoice.reminder_count = used.length
    invoice.last_reminder_at = restoredAt
  }
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
  /** false = mailen gik ud UDEN faktura-PDF (render fejlede) — vises for brugeren */
  pdfAttached?: boolean
}

/**
 * Send the initial invoice email and transition the invoice to
 * status='sent'. Idempotent: if already sent, returns 'already_sent'
 * without re-sending.
 */
/**
 * Mail-review 2026-10-07: send-kravet ("claim") FØR afsendelse. Før: tjek → PDF → send → status 'sent' bagefter, så to
 * samtidige kald (dobbeltklik, to faner, manuel send + automatik-regel) begge sendte mailen og bogførte i e-conomic.
 * Nu sættes sent_at betinget (kun kladde uden sent_at) før noget sendes; den anden kalder ser sent_at og springer over.
 * Ender afsendelsen ikke i 'sent', frigives kravet igen (kun hvis fakturaen stadig er kladde).
 */
export async function sendInvoiceEmail(invoiceId: string): Promise<SendInvoiceEmailResult> {
  const supabase = createAdminClient()
  const { data: claimed, error: claimErr } = await supabase
    .from('invoices')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('status', 'draft')
    .is('sent_at', null)
    .select('id')
    .maybeSingle()
  if (claimErr) return { invoiceId, status: 'failed', error: 'claim failed' }
  if (!claimed) {
    const { data: cur } = await supabase.from('invoices').select('status').eq('id', invoiceId).maybeSingle()
    if (!cur) return { invoiceId, status: 'failed', error: 'invoice not found' }
    return { invoiceId, status: 'already_sent', reason: `status=${(cur as { status: string }).status} (eller sendes allerede)` }
  }
  const release = async () => {
    await supabase.from('invoices').update({ sent_at: null }).eq('id', invoiceId).eq('status', 'draft')
  }
  let result: SendInvoiceEmailResult
  try {
    result = await sendClaimedInvoiceEmail(invoiceId)
  } catch (err) {
    await release()
    throw err
  }
  if (result.status !== 'sent') await release()
  return result
}

async function sendClaimedInvoiceEmail(invoiceId: string): Promise<SendInvoiceEmailResult> {
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

  // Safety: never send twice — kaldes kun med et gyldigt krav (sent_at sat af sendInvoiceEmail); status skal være kladde
  if (invoice.status !== 'draft') {
    return { invoiceId, status: 'already_sent', reason: `status=${invoice.status}` }
  }

  if (!invoice.customer_id) {
    return { invoiceId, status: 'skipped', reason: 'no customer linked' }
  }

  // X1: betalingsbetingelserne regnes fra AFSENDELSEN (ikke fra kladdens oprettelse) — mail og PDF viser den nye dato,
  // og den gemmes sammen med status 'sent' nedenfor
  const sendNow = new Date()
  const rebasedDue = rebaseDueDateOnSend(invoice.created_at, invoice.due_date, sendNow)
  if (rebasedDue) invoice.due_date = rebasedDue

  // Sprint 8H Phase 2: central mail-router.
  // resolveInvoiceMailRoute prefererer billing_contact, fallback til
  // customer.email. ALDRIG site_contact.
  const { resolveInvoiceMailRoute, logMailRoute } = await import(
    '@/lib/actions/mail-route-resolvers'
  )
  const routeResult = await resolveInvoiceMailRoute(invoiceId, {
    fromMailboxOverride: INVOICE_FROM_MAILBOX,
  })
  if (!routeResult.ok || !routeResult.route) {
    return {
      invoiceId,
      status: 'skipped',
      reason: routeResult.error || 'routing failed',
    }
  }
  const route = routeResult.route
  const recipient = route.toEmail

  // Hent kunde-metadata for template
  const { data: cust } = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email')
    .eq('id', invoice.customer_id)
    .maybeSingle()

  // Sprint Ø3.7 — firmainfo + redigerbar template-config (direkte via admin-
  // client, IKKE getCompanySettings-action, så cron uden bruger ikke fejler
  // på settings.view-permission). NULL config → fallback til kodestandard.
  const { parseInvoiceEmailConfig } = await import('@/lib/email/invoice-email-config')
  // Offentlige firmakolonner (navn, kontakt, bank, logo, mail-config) via
  // service-role efter action-gaten — bruges til både mailtekst og PDF, så
  // alle roller med invoices.send får PDF'en med (før: getCompanySettings
  // krævede settings.view → bogholderi sendte fakturaer UDEN PDF).
  const { COMPANY_SETTINGS_PUBLIC_COLUMNS } = await import('@/lib/settings/company-columns')
  const { data: companyData } = await supabase
    .from('company_settings')
    .select(COMPANY_SETTINGS_PUBLIC_COLUMNS)
    .limit(1)
    .maybeSingle()
  const companyRow = companyData as unknown as (import('@/types/company-settings.types').CompanySettings & {
    invoice_email_config?: unknown
  }) | null
  const emailCfg = parseInvoiceEmailConfig(companyRow?.invoice_email_config)
  let caseNumber: string | null = null
  if (invoice.case_id) {
    const { data: sc } = await supabase
      .from('service_cases')
      .select('case_number')
      .eq('id', invoice.case_id)
      .maybeSingle()
    caseNumber = (sc?.case_number as string | null) ?? null
  }

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) {
    return { invoiceId, status: 'failed', error: 'Graph not configured' }
  }

  // Use invoice number as default payment reference if none was set yet.
  const paymentReference = invoice.payment_reference || invoice.invoice_number

  // Sprint 6F-4 — slå original-fakturanummer op for kreditnotaer, så
  // mailen kan vise "Krediterer faktura F-XXXX".
  const isCreditNote = invoice.invoice_type === 'credit'
  let creditOfInvoiceNumber: string | null = null
  if (isCreditNote && invoice.credit_of_invoice_id) {
    const { data: orig } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('id', invoice.credit_of_invoice_id)
      .maybeSingle()
    if (orig?.invoice_number) {
      creditOfInvoiceNumber = orig.invoice_number as string
    }
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
      ? new Date(invoice.due_date).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '',
    paymentReference,
    // Samme kilde som PDF'en (env, firmaindstillinger som fallback) — bank-info.ts
    bankRegNo: invoiceBankInfo(companyRow as { bank_reg_no?: string | null; bank_account?: string | null } | null).regNo,
    bankAccount: invoiceBankInfo(companyRow as { bank_reg_no?: string | null; bank_account?: string | null } | null).account,
    isCreditNote,
    creditOfInvoiceNumber,
    companyName: companyRow?.company_name ?? null,
    companyEmail: companyRow?.company_email ?? null,
    companyPhone: companyRow?.company_phone ?? null,
    caseNumber,
  } as const

  // Sprint 6C — render the invoice PDF and attach it. Best-effort:
  // if the render fails we still send the HTML mail (operatør skal
  // helst ikke blokeres af en PDF-fejl). The customer can always pull
  // the latest PDF from /api/invoices/[id]/pdf if it's missing.
  let pdfAttachment: { filename: string; content: Buffer; contentType: string } | null = null
  try {
    const rawPayload = await getInvoicePdfPayload(invoiceId)
    // X1: PDF'en der sendes viser udstedelsesdato (i dag) og den flyttede forfaldsdato
    const payload = rawPayload
      ? { ...rawPayload, invoice: { ...rawPayload.invoice, sent_at: sendNow.toISOString(), due_date: invoice.due_date } }
      : rawPayload
    if (payload && companyRow) {
      const { renderToBuffer } = await import('@react-pdf/renderer')
      const { InvoicePdfDocument } = await import('@/lib/pdf/invoice-pdf-template')
      const buffer = await renderToBuffer(
        InvoicePdfDocument({ payload, companySettings: companyRow }) as Parameters<typeof renderToBuffer>[0]
      )
      pdfAttachment = {
        filename: `${invoice.invoice_number}.pdf`,
        content: buffer,
        contentType: 'application/pdf',
      }
    }
  } catch (err) {
    logger.warn('sendInvoiceEmail: PDF render failed — sending without attachment', {
      entityId: invoiceId,
      error: err instanceof Error ? err : new Error(String(err)),
    })
  }

  const result = await sendEmailViaGraph({
    to: recipient,
    subject: buildInvoiceEmailSubject(params, emailCfg),
    html: buildInvoiceEmailHtml(params, emailCfg),
    fromMailbox: INVOICE_FROM_MAILBOX,
    senderName: emailCfg.sender_name?.trim() || undefined,
    replyTo: emailCfg.reply_to?.trim() || undefined,
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
  })

  if (!result.success) {
    logger.error('sendInvoiceEmail Graph send failed', {
      entityId: invoiceId,
      metadata: { recipient, invoice_number: invoice.invoice_number },
      error: new Error(result.error || 'send failed'),
    })
    await logMailRoute(route, 'failed', { invoiceId, error: result.error })
    return { invoiceId, status: 'failed', recipient, error: result.error }
  }

  await logMailRoute(route, 'sent', { invoiceId, messageId: result.messageId })

  // Flip status draft → sent and persist payment_reference if we
  // generated one.
  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: sendNow.toISOString(),
      payment_reference: paymentReference,
      ...(rebasedDue ? { due_date: rebasedDue } : {}),
    })
    .eq('id', invoiceId)
    .eq('status', 'draft') // guard against concurrent send
  if (updErr) {
    logger.warn('sendInvoiceEmail: status update failed (already moved?)', {
      entityId: invoiceId,
      error: updErr,
    })
  }
  // Økonomi-review 2026-10-08 (#1): en kreditnota sendt pr. mail annullerede aldrig originalen (kun setInvoiceStatus
  // gjorde) → fuldt krediteret original stod som udestående/forfalden, i bankmatch og kunne eksporteres
  if (!updErr && invoice.invoice_type === 'credit' && invoice.credit_of_invoice_id) {
    await recomputeOriginalVoidStatus(invoice.credit_of_invoice_id, null)
  }

  console.log('INVOICE SENT:', invoiceId)
  try {
    const { logHealth } = await import('@/lib/services/system-health')
    await logHealth('invoice', 'ok', `invoice sent: ${invoice.invoice_number}`, { invoiceId, recipient })
  } catch { /* never crash */ }

  // Sync to e-conomic (Phase 5.4). Best-effort — never blocks send.
  // Sprint 6F-4 — kreditnotaer skubbes IKKE til e-conomic før dedikeret
  // refund-flow er bygget; ellers risikerer vi at booke negative bilag
  // forkert i bogføringen. Skip guard.
  if (isCreditNote) {
    return { invoiceId, status: 'sent', recipient, pdfAttached: !!pdfAttachment }
  }
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

  return { invoiceId, status: 'sent', recipient, pdfAttached: !!pdfAttachment }
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
  /** Fallback hourly rate when employees.hourly_rate is null. Default:
   *  getStandardSaleRate() (calculation_settings master, ellers FALLBACK_SALE_RATE). */
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

  // Sprint 2D: fallback-sats (kun brugt når employees.hourly_rate er null)
  // hentes fra central accessor (master = calculation_settings.hourly_rates),
  // i stedet for env DEFAULT_HOURLY_RATE / 650. Eksplicit caller-override
  // via options.defaultHourlyRate vinder stadig.
  const p_default_hourly_rate = options.defaultHourlyRate ?? (await getStandardSaleRate())

  // Sprint 2E.2A: resolver betalingsfrist (customer → company → 14) når
  // caller ikke har angivet en eksplicit override.
  let dueDays = options.dueDays
  if (dueDays === undefined) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('customer_id')
      .eq('id', workOrderId)
      .maybeSingle()
    dueDays = await resolvePaymentTermsDays(supabase, wo?.customer_id ?? null)
  }

  const { data, error } = await supabase.rpc('create_invoice_from_work_order', {
    p_work_order_id: workOrderId,
    p_due_days: dueDays,
    p_default_hourly_rate,
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
    .select('id, status, payment_status, amount_paid, final_amount, currency, invoice_type, voided_at')
    .eq('id', invoiceId)
    .maybeSingle()
  if (readErr || !inv) {
    throw new Error(`registerPayment: invoice ${invoiceId} not found`)
  }
  // Økonomi-review 2026-10-08 (#3): bankmatch kunne "betale" en kladde (aldrig sendt → kan ikke slettes, mark-paid i
  // e-conomic for en ikke-eksporteret faktura), en kreditnota eller en annulleret faktura
  if (inv.status === 'draft' || inv.invoice_type === 'credit' || inv.voided_at) {
    throw new Error(`registerPayment: invoice ${invoiceId} kan ikke modtage betaling (status=${inv.status}${inv.invoice_type === 'credit' ? ', kreditnota' : ''}${inv.voided_at ? ', annulleret' : ''})`)
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

  // Økonomi-review 2026-10-08 (#5): amount_paid = læst + beløb tabte en betaling ved samtidige registreringer (manuelt
  // match + automatch). Nu = summen af invoice_payments (inkl. vores netop indsatte række) — sidste skriver har altid
  // alle committede betalinger med. (#7): "fuldt betalt" måles mod udestående efter sendte/betalte kreditnotaer.
  const { data: payRows } = await supabase.from('invoice_payments').select('amount').eq('invoice_id', invoiceId)
  const newAmountPaid = round2(((payRows ?? []) as Array<{ amount: number | string }>).reduce((a, r) => a + (Number(r.amount) || 0), 0))
  const { data: creditRows } = await supabase.from('invoices').select('final_amount')
    .eq('credit_of_invoice_id', invoiceId).eq('invoice_type', 'credit').in('status', ['sent', 'paid'])
  const credited = ((creditRows ?? []) as Array<{ final_amount: number | string | null }>).reduce((a, r) => a + Math.abs(Number(r.final_amount) || 0), 0)
  const final = round2(Number(inv.final_amount) - credited)
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
