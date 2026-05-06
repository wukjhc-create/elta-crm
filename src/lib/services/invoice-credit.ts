/**
 * Sprint 6F-2 — Credit-note services.
 *
 * Two orchestrators:
 *   - getCreditedAmountForInvoice(invoiceId)  — summary om hvor meget
 *     der er krediteret af en original faktura
 *   - createCreditNoteForInvoice(input)        — opret kreditnota
 *     (full / partial med linjer / partial med beløb)
 *
 * Idempotency / dobbelt-credit-beskyttelse:
 *   - Service læser sum af eksisterende credits FØR INSERT og afviser
 *     hvis ny credit + eksisterende > original.final_amount
 *   - DB-niveau guards:
 *     · invoice_type CHECK håndhæver 'credit' enum
 *     · credit_of_invoice_id ON DELETE RESTRICT (original kan ikke
 *       slettes mens credit peger på den)
 *     · invoice_number UNIQUE
 *   - Race-safety: vi genlæser kreditsum lige før insert. Hvis en
 *     anden credit kom imellem, fanger summen det.
 *
 * Auto-void: hvis ny credit gør sum_credits = original.final_amount
 * sætter vi `voided_at` + `voided_by` på originalen. Reminder-cron
 * skal i 6F-4 filtrere disse ud.
 *
 * No e-conomic. No PDF render. No mail send. Pure compose.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { InvoiceLineRow, InvoiceRow } from '@/types/invoice.types'

const r2 = (n: number) => Math.round(n * 100) / 100

// =====================================================
// getCreditedAmountForInvoice
// =====================================================

export interface CreditSummary {
  ok: boolean
  message?: string
  original_invoice_id: string | null
  original_invoice_number: string | null
  /** Subtotal ex moms på original (negativ er ikke tilladt — kreditnota er ikke en kandidat for at blive yderligere krediteret) */
  original_total_ex_vat: number
  original_vat: number
  original_total_incl_vat: number
  existing_credit_notes: Array<{
    id: string
    invoice_number: string
    status: 'draft' | 'sent' | 'paid'
    final_amount: number          // negativ
    total_amount: number          // negativ
    tax_amount: number            // negativ
    credit_reason: string | null
    created_at: string
  }>
  /**
   * Sum af ALLE kreditnotaer (drafts + sent + paid) — bruges til
   * remaining_creditable beregning så drafts reserverer beløb og ny
   * kreditnota ikke kan oprette over 100 % af original.
   * Sprint 6F-3 fix: split tilføjet for at skelne juridisk void
   * (kun finalized) fra UI-reservation (alle drafts).
   */
  credited_ex_vat_total: number      // positivt tal — abs sum (drafts + finalized)
  credited_vat_total: number
  credited_incl_vat_total: number
  /** Sprint 6F-3 fix — kun sent/paid kreditnotaer (juridisk gældende) */
  credited_finalized_ex_vat_total: number
  credited_finalized_vat_total: number
  credited_finalized_incl_vat_total: number
  /** Sprint 6F-3 fix — kun draft kreditnotaer (reserveret men ikke gældende) */
  credited_draft_ex_vat_total: number
  credited_draft_vat_total: number
  credited_draft_incl_vat_total: number
  /** Antal-tællere */
  finalized_credit_count: number
  draft_credit_count: number
  remaining_creditable_ex_vat: number
  remaining_creditable_incl_vat: number
  /** True når voided_at er sat på original-fakturaen */
  is_voided: boolean
  voided_at: string | null
  /**
   * Sprint 6F-3 fix — true når der er ≥1 draft kreditnota og INGEN
   * finalized kreditnotaer endnu. UI viser så "Kreditnota-kladde
   * findes"-advarsel uden at vise faktura som annulleret.
   */
  has_only_draft_credits: boolean
  /**
   * Sprint 6F-3 fix — true når finalized credits dækker hele original.
   * Kan være true uden at voided_at er sat (race), men UI behandler
   * dem ens. Drives af credited_finalized_ex_vat_total ≥ original_total_ex_vat.
   */
  is_fully_credited_finalized: boolean
}

export async function getCreditedAmountForInvoice(
  invoiceId: string
): Promise<CreditSummary> {
  const supabase = createAdminClient()
  const empty: CreditSummary = {
    ok: false,
    original_invoice_id: null,
    original_invoice_number: null,
    original_total_ex_vat: 0,
    original_vat: 0,
    original_total_incl_vat: 0,
    existing_credit_notes: [],
    credited_ex_vat_total: 0,
    credited_vat_total: 0,
    credited_incl_vat_total: 0,
    credited_finalized_ex_vat_total: 0,
    credited_finalized_vat_total: 0,
    credited_finalized_incl_vat_total: 0,
    credited_draft_ex_vat_total: 0,
    credited_draft_vat_total: 0,
    credited_draft_incl_vat_total: 0,
    finalized_credit_count: 0,
    draft_credit_count: 0,
    remaining_creditable_ex_vat: 0,
    remaining_creditable_incl_vat: 0,
    is_voided: false,
    voided_at: null,
    has_only_draft_credits: false,
    is_fully_credited_finalized: false,
  }

  const { data: orig, error: origErr } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_type, total_amount, tax_amount, final_amount, voided_at'
    )
    .eq('id', invoiceId)
    .maybeSingle()
  if (origErr || !orig) {
    return { ...empty, message: 'Faktura ikke fundet' }
  }

  const origTyped = orig as unknown as {
    id: string
    invoice_number: string
    invoice_type: string
    total_amount: number | string
    tax_amount: number | string
    final_amount: number | string
    voided_at: string | null
  }

  const total_ex_vat = Number(origTyped.total_amount)
  const vat = Number(origTyped.tax_amount)
  const total_incl = Number(origTyped.final_amount)

  // Find eksisterende kreditnotaer der peger på denne faktura
  const { data: credits } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, status, total_amount, tax_amount, final_amount, credit_reason, created_at'
    )
    .eq('credit_of_invoice_id', invoiceId)
    .eq('invoice_type', 'credit')
    .order('created_at', { ascending: true })

  type CR = {
    id: string
    invoice_number: string
    status: string
    total_amount: number | string
    tax_amount: number | string
    final_amount: number | string
    credit_reason: string | null
    created_at: string
  }
  const creditRows = (credits ?? []) as unknown as CR[]

  let absExVat = 0
  let absVat = 0
  let absIncl = 0
  let finalizedExVat = 0
  let finalizedVat = 0
  let finalizedIncl = 0
  let draftExVat = 0
  let draftVat = 0
  let draftIncl = 0
  let finalizedCount = 0
  let draftCount = 0
  const list: CreditSummary['existing_credit_notes'] = []
  for (const c of creditRows) {
    const exv = Number(c.total_amount)
    const tax = Number(c.tax_amount)
    const incl = Number(c.final_amount)
    const aExv = Math.abs(exv)
    const aTax = Math.abs(tax)
    const aIncl = Math.abs(incl)
    absExVat += aExv
    absVat += aTax
    absIncl += aIncl
    if (c.status === 'sent' || c.status === 'paid') {
      finalizedExVat += aExv
      finalizedVat += aTax
      finalizedIncl += aIncl
      finalizedCount += 1
    } else {
      // 'draft' (reservation only)
      draftExVat += aExv
      draftVat += aTax
      draftIncl += aIncl
      draftCount += 1
    }
    list.push({
      id: c.id,
      invoice_number: c.invoice_number,
      status: c.status as 'draft' | 'sent' | 'paid',
      final_amount: incl,
      total_amount: exv,
      tax_amount: tax,
      credit_reason: c.credit_reason,
      created_at: c.created_at,
    })
  }

  const remaining_ex = r2(total_ex_vat - absExVat)
  const remaining_incl = r2(total_incl - absIncl)
  const fullyCreditedFinalized =
    total_ex_vat > 0 && finalizedExVat + 0.005 >= total_ex_vat
  const onlyDraftCredits = draftCount > 0 && finalizedCount === 0

  return {
    ok: true,
    original_invoice_id: origTyped.id,
    original_invoice_number: origTyped.invoice_number,
    original_total_ex_vat: r2(total_ex_vat),
    original_vat: r2(vat),
    original_total_incl_vat: r2(total_incl),
    existing_credit_notes: list,
    credited_ex_vat_total: r2(absExVat),
    credited_vat_total: r2(absVat),
    credited_incl_vat_total: r2(absIncl),
    credited_finalized_ex_vat_total: r2(finalizedExVat),
    credited_finalized_vat_total: r2(finalizedVat),
    credited_finalized_incl_vat_total: r2(finalizedIncl),
    credited_draft_ex_vat_total: r2(draftExVat),
    credited_draft_vat_total: r2(draftVat),
    credited_draft_incl_vat_total: r2(draftIncl),
    finalized_credit_count: finalizedCount,
    draft_credit_count: draftCount,
    remaining_creditable_ex_vat: remaining_ex,
    remaining_creditable_incl_vat: remaining_incl,
    is_voided: !!origTyped.voided_at,
    voided_at: origTyped.voided_at,
    has_only_draft_credits: onlyDraftCredits,
    is_fully_credited_finalized: fullyCreditedFinalized,
  }
}

// =====================================================
// createCreditNoteForInvoice
// =====================================================

export interface CreateCreditNoteInput {
  invoice_id: string
  credit_type: 'full' | 'partial'
  reason: string
  selected_line_ids?: string[]
  custom_amount_ex_vat?: number
  due_days?: number
  notes?: string | null
}

export interface CreateCreditNoteResult {
  ok: boolean
  message: string
  credit_invoice_id: string | null
  credit_invoice_number: string | null
  credited_ex_vat: number
  credited_vat: number
  credited_incl_vat: number
  voided_original: boolean
  remaining_after_creditable_ex_vat: number
}

export async function createCreditNoteForInvoice(
  input: CreateCreditNoteInput,
  approverId: string
): Promise<CreateCreditNoteResult> {
  const supabase = createAdminClient()
  const empty: CreateCreditNoteResult = {
    ok: false,
    message: '',
    credit_invoice_id: null,
    credit_invoice_number: null,
    credited_ex_vat: 0,
    credited_vat: 0,
    credited_incl_vat: 0,
    voided_original: false,
    remaining_after_creditable_ex_vat: 0,
  }

  // ---- Validate input shape ----
  if (!input.reason || input.reason.trim().length === 0) {
    return { ...empty, message: 'Begrundelse (reason) er påkrævet' }
  }
  if (input.credit_type !== 'full' && input.credit_type !== 'partial') {
    return { ...empty, message: 'credit_type skal være "full" eller "partial"' }
  }
  if (input.credit_type === 'partial') {
    const hasLines = (input.selected_line_ids ?? []).length > 0
    const hasAmount =
      input.custom_amount_ex_vat != null && Number.isFinite(input.custom_amount_ex_vat)
    if (!hasLines && !hasAmount) {
      return {
        ...empty,
        message:
          'Partial kredit kræver enten selected_line_ids eller custom_amount_ex_vat',
      }
    }
    if (hasLines && hasAmount) {
      return {
        ...empty,
        message:
          'Partial kredit kan ikke kombinere selected_line_ids OG custom_amount_ex_vat — vælg én',
      }
    }
    if (hasAmount && Number(input.custom_amount_ex_vat) <= 0) {
      return { ...empty, message: 'custom_amount_ex_vat skal være > 0' }
    }
  }

  // ---- Read original invoice ----
  const { data: orig, error: origErr } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_type, status, customer_id, case_id, currency, total_amount, tax_amount, final_amount, voided_at'
    )
    .eq('id', input.invoice_id)
    .maybeSingle()
  if (origErr || !orig) {
    return { ...empty, message: 'Original faktura ikke fundet' }
  }
  const original = orig as unknown as {
    id: string
    invoice_number: string
    invoice_type: string
    status: string
    customer_id: string | null
    case_id: string | null
    currency: string
    total_amount: number | string
    tax_amount: number | string
    final_amount: number | string
    voided_at: string | null
  }

  // ---- Status / type-gates ----
  if (original.status === 'draft') {
    return {
      ...empty,
      message:
        'Kladder kan ikke krediteres — slet kladden i stedet (deleteInvoiceDraft)',
    }
  }
  if (original.invoice_type === 'credit') {
    return { ...empty, message: 'En kreditnota kan ikke selv krediteres' }
  }
  if (!original.customer_id) {
    return { ...empty, message: 'Original faktura mangler kunde — kan ikke kreditere' }
  }

  // ---- Read existing credits (race-safety: re-read just before insert) ----
  const summary = await getCreditedAmountForInvoice(input.invoice_id)
  if (!summary.ok) {
    return { ...empty, message: summary.message ?? 'Kunne ikke beregne kredit-status' }
  }
  if (summary.remaining_creditable_ex_vat <= 0) {
    return {
      ...empty,
      message:
        'Faktura er allerede fuldt krediteret — der er intet beløb tilbage at kreditere',
    }
  }

  const origTotalExVat = Number(original.total_amount)

  // ---- Build credit lines based on credit_type ----
  type Line = {
    description: string
    quantity: number
    unit: string | null
    unit_price: number
    total_price: number
  }
  const newLines: Line[] = []
  let creditExVat = 0

  if (input.credit_type === 'full') {
    // Krediter resterende beløb. Opret én sammenfattende linje.
    creditExVat = summary.remaining_creditable_ex_vat
    newLines.push({
      description: `Kreditnota for faktura ${original.invoice_number} — ${input.reason.trim()}`,
      quantity: 1,
      unit: 'stk',
      unit_price: -creditExVat,
      total_price: -creditExVat,
    })
  } else {
    // partial
    if (input.custom_amount_ex_vat != null) {
      const amt = Number(input.custom_amount_ex_vat)
      if (amt > summary.remaining_creditable_ex_vat) {
        return {
          ...empty,
          message: `Beløb ${amt.toFixed(2)} kr overstiger resterende krediterbart ${summary.remaining_creditable_ex_vat.toFixed(2)} kr`,
        }
      }
      creditExVat = r2(amt)
      newLines.push({
        description: `Kreditnota for faktura ${original.invoice_number} — ${input.reason.trim()}`,
        quantity: 1,
        unit: 'stk',
        unit_price: -creditExVat,
        total_price: -creditExVat,
      })
    } else {
      // selected_line_ids
      const lineIds = input.selected_line_ids ?? []
      const { data: origLines } = await supabase
        .from('invoice_lines')
        .select('id, position, description, quantity, unit, unit_price, total_price')
        .eq('invoice_id', original.id)
        .in('id', lineIds)
      const rows = (origLines ?? []) as Array<{
        id: string
        position: number
        description: string
        quantity: number | string
        unit: string | null
        unit_price: number | string
        total_price: number | string
      }>
      if (rows.length === 0) {
        return { ...empty, message: 'Ingen af de valgte linjer findes på fakturaen' }
      }

      let sum = 0
      for (const r of rows) {
        const tot = Number(r.total_price)
        // Negér linjen — hvis original-linjen er positiv (typisk),
        // bliver kreditlinjen negativ. Hvis original er negativ
        // (fx fradrag på slutfaktura), bliver kreditlinjen positiv —
        // og det er korrekt: vi reverserer linjens fortegn.
        const negTot = -tot
        const negUnit = -Number(r.unit_price)
        sum += Math.abs(negTot)
        newLines.push({
          description: `Kreditnota: ${r.description}`,
          quantity: Number(r.quantity),
          unit: r.unit,
          unit_price: negUnit,
          total_price: negTot,
        })
      }
      creditExVat = r2(sum)

      if (creditExVat > summary.remaining_creditable_ex_vat) {
        return {
          ...empty,
          message: `Sum af valgte linjer ${creditExVat.toFixed(2)} kr overstiger resterende krediterbart ${summary.remaining_creditable_ex_vat.toFixed(2)} kr (delvis kreditering tidligere?). Brug "full" eller custom_amount.`,
        }
      }
    }
  }

  if (creditExVat <= 0 || newLines.length === 0) {
    return { ...empty, message: 'Ingen krediterbare linjer dannet' }
  }

  // ---- Compute VAT (samme rate som original) ----
  // Original.tax_amount / original.total_amount giver original-rate;
  // hvis original er 25 % er det også vores credit-rate.
  const origVatRate =
    origTotalExVat > 0
      ? Number(original.tax_amount) / origTotalExVat
      : 0.25

  const creditVat = r2(creditExVat * origVatRate)
  const creditIncl = r2(creditExVat + creditVat)

  // ---- Allocate invoice number ----
  const { data: numData, error: numErr } = await supabase.rpc('allocate_invoice_number')
  if (numErr || !numData) {
    return {
      ...empty,
      message: `Kunne ikke allokere fakturanummer: ${numErr?.message ?? 'ukendt'}`,
    }
  }
  const invoiceNumber = String(numData)

  // ---- Compute due_date ----
  const dueDays = input.due_days ?? 14
  const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // ---- INSERT credit invoice header ----
  // Negative totals — total_amount / tax_amount / final_amount er
  // alle negative tal på en kreditnota.
  const { data: header, error: hdrErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_id: original.customer_id,
      case_id: original.case_id,
      currency: original.currency,
      status: 'draft' as const,
      payment_status: 'pending' as const,
      invoice_type: 'credit' as const,
      credit_of_invoice_id: original.id,
      credit_reason: input.reason.trim(),
      stage_label: 'Kreditnota',
      is_final_invoice: false,
      total_amount: -creditExVat,
      tax_amount: -creditVat,
      final_amount: -creditIncl,
      amount_paid: 0,
      due_date: dueDate,
      reminder_count: 0,
      notes: input.notes?.trim() || null,
    })
    .select('id, invoice_number')
    .single()
  if (hdrErr || !header) {
    return {
      ...empty,
      message: `Kunne ikke oprette kreditnota-header: ${hdrErr?.message ?? 'ukendt'}`,
    }
  }

  // ---- INSERT credit lines ----
  const lineRows = newLines.map((l, i) => ({
    invoice_id: header.id,
    position: i + 1,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit ?? 'stk',
    unit_price: l.unit_price,
    total_price: l.total_price,
  }))
  const { error: linesErr } = await supabase.from('invoice_lines').insert(lineRows)
  if (linesErr) {
    await supabase.from('invoices').delete().eq('id', header.id)
    return {
      ...empty,
      message: `Linje-INSERT fejlede (kreditnota rullet tilbage): ${linesErr.message}`,
    }
  }

  // ---- Audit-trail i invoice_predecessors junction (genbrug fra mig 00106) ----
  // Best-effort. Schema fra 00106:
  //   invoice_id              = kreditnota
  //   predecessor_invoice_id  = original
  //   deduction_amount        = krediteret beløb (positivt absolutbeløb)
  // UNIQUE(invoice_id, predecessor_invoice_id) sikrer idempotens.
  try {
    await supabase.from('invoice_predecessors').insert({
      invoice_id: header.id,
      predecessor_invoice_id: original.id,
      deduction_amount: creditExVat,
    })
  } catch (e) {
    logger.warn('credit predecessor link failed (credit invoice still created)', {
      entityId: header.id,
      error: e instanceof Error ? e : new Error(String(e)),
    })
  }

  // ---- Sprint 6F-3 fix: NO auto-void on draft creation ----
  // Tidligere version satte voided_at på original allerede her, hvilket
  // var juridisk forkert: en draft kreditnota må IKKE annullere
  // originalen. Voiding sker først når kreditnotaen markeres som sendt
  // (se setInvoiceStatus → recomputeOriginalVoidStatus i invoices.ts).
  //
  // Beregningen efterlades for return-værdien så UI/operatør ser hvad
  // der ER reserveret, men intet skrives til DB her.
  const voidedOriginal = false
  const newCreditedTotalExVat = r2(summary.credited_ex_vat_total + creditExVat)
  const remainingAfter = r2(origTotalExVat - newCreditedTotalExVat)

  logger.info('credit note created (draft — original not voided)', {
    entity: 'invoices',
    entityId: header.id,
    metadata: {
      original_invoice_id: original.id,
      original_invoice_number: original.invoice_number,
      credit_type: input.credit_type,
      credited_ex_vat: creditExVat,
      created_by: approverId,
    },
  })

  return {
    ok: true,
    message:
      `Kreditnota ${header.invoice_number} oprettet (${creditExVat.toLocaleString('da-DK')} kr ekskl. moms)` +
      (voidedOriginal ? ` — original fuldt krediteret og voided` : ''),
    credit_invoice_id: header.id,
    credit_invoice_number: header.invoice_number,
    credited_ex_vat: creditExVat,
    credited_vat: creditVat,
    credited_incl_vat: creditIncl,
    voided_original: voidedOriginal,
    remaining_after_creditable_ex_vat: Math.max(0, remainingAfter),
  }
}

// Re-export types for actions to consume without circular import
export type { InvoiceRow as _InvoiceRow, InvoiceLineRow as _InvoiceLineRow }
