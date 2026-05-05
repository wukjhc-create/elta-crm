/**
 * Sprint 6D-2 — Multi-stage invoice services.
 *
 * Three orchestrators:
 *   - createStageInvoiceForCase  — deposit / progress (procent × basis)
 *   - createFinalInvoiceForCase  — final med fradrag af forgængere
 *   - listStageInvoicesForCase   — alle stage-fakturaer på sagen
 *
 * Idempotency / dobbelt-bogføringsbeskyttelse:
 *   - DB UNIQUE PARTIAL idx_invoices_one_final_per_case nægter to
 *     slutfakturaer på samme sag.
 *   - Procent-sum-tjek: vi summer eksisterende deposit+progress
 *     percent på sagen og afviser hvis ny rate ville bringe os
 *     over 100 % af basis (kan overskrives via allow_over=true).
 *   - "Slut allerede findes" gate: ny deposit/progress nægtes når
 *     case har is_final_invoice=true.
 *
 * No e-conomic. No PDF render. No mail send. Pure compose.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { InvoiceRow, InvoiceLineRow } from '@/types/invoice.types'

export type InvoiceType = 'standard' | 'deposit' | 'progress' | 'final' | 'credit'
export type AmountBasis = 'contract_sum' | 'revised_sum' | 'lines'

const r2 = (n: number) => Math.round(n * 100) / 100
const VAT_RATE = 0.25

// =====================================================
// createStageInvoiceForCase — deposit + progress
// =====================================================

export interface CreateStageInvoiceInput {
  case_id: string
  invoice_type: 'deposit' | 'progress'
  amount_basis: 'contract_sum' | 'revised_sum'
  billing_percentage: number
  stage_label?: string | null
  due_days?: number
  notes?: string | null
  /**
   * If true, allow the cumulative deposit+progress percentage on this
   * sag to exceed 100%. Default false (the service refuses).
   */
  allow_over?: boolean
}

export interface CreateStageInvoiceResult {
  ok: boolean
  message: string
  invoice_id: string | null
  invoice_number: string | null
  total_amount: number | null         // ekskl. moms
  tax_amount: number | null
  final_amount: number | null
  cumulative_percentage_after: number | null
}

export async function createStageInvoiceForCase(
  input: CreateStageInvoiceInput,
  approverId: string
): Promise<CreateStageInvoiceResult> {
  const supabase = createAdminClient()
  const empty: CreateStageInvoiceResult = {
    ok: false,
    message: '',
    invoice_id: null,
    invoice_number: null,
    total_amount: null,
    tax_amount: null,
    final_amount: null,
    cumulative_percentage_after: null,
  }

  if (input.invoice_type !== 'deposit' && input.invoice_type !== 'progress') {
    return { ...empty, message: `invoice_type ${input.invoice_type} ikke understøttet her — brug createFinalInvoiceForCase eller createInvoiceDraftFromCase` }
  }
  if (!['contract_sum', 'revised_sum'].includes(input.amount_basis)) {
    return { ...empty, message: 'amount_basis skal være contract_sum eller revised_sum' }
  }
  const pct = Number(input.billing_percentage)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { ...empty, message: 'billing_percentage skal være mellem 0 og 100' }
  }

  // 1. Sag + customer + basis-værdi
  const { data: sag } = await supabase
    .from('service_cases')
    .select('id, case_number, customer_id, contract_sum, revised_sum')
    .eq('id', input.case_id)
    .maybeSingle()
  if (!sag) return { ...empty, message: 'Sag ikke fundet' }
  if (!sag.customer_id) return { ...empty, message: 'Sagen mangler en kunde' }

  const basisValue =
    input.amount_basis === 'contract_sum'
      ? Number(sag.contract_sum)
      : Number(sag.revised_sum)
  if (!Number.isFinite(basisValue) || basisValue <= 0) {
    return {
      ...empty,
      message:
        input.amount_basis === 'contract_sum'
          ? 'Sagen mangler kontraktsum (contract_sum)'
          : 'Sagen mangler revideret beløb (revised_sum)',
    }
  }

  // 2. Slut-gate — ingen ny deposit/progress når slut findes
  const { count: finalCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', input.case_id)
    .eq('is_final_invoice', true)
  if ((finalCount ?? 0) > 0) {
    return {
      ...empty,
      message: 'Slutfaktura findes allerede på sagen — ny deposit/progress er ikke tilladt',
    }
  }

  // 3. Procent-sum-gate
  const { data: existingStages } = await supabase
    .from('invoices')
    .select('billing_percentage, status')
    .eq('case_id', input.case_id)
    .in('invoice_type', ['deposit', 'progress'])
    .neq('status', 'rejected' as never)              // status enum is draft/sent/paid; rejected is incoming-only
  const cumulativeBefore = (existingStages ?? []).reduce(
    (s, r) => s + (r.billing_percentage == null ? 0 : Number(r.billing_percentage)),
    0
  )
  const cumulativeAfter = r2(cumulativeBefore + pct)
  if (cumulativeAfter > 100 && !input.allow_over) {
    return {
      ...empty,
      message: `Samlet rate-procent ville blive ${cumulativeAfter} % (basis: ${cumulativeBefore} % allerede + ${pct} % ny). Maks 100 %. Send med allow_over=true hvis du virkelig vil over.`,
      cumulative_percentage_after: cumulativeAfter,
    }
  }

  // 4. Allokér nummer
  const { data: numData, error: numErr } = await supabase.rpc('allocate_invoice_number')
  if (numErr || !numData) {
    return { ...empty, message: `Kunne ikke allokere fakturanummer: ${numErr?.message ?? 'ukendt'}` }
  }
  const invoiceNumber = String(numData)

  // 5. Beregn beløb
  const subtotal = r2(basisValue * (pct / 100))
  const tax = r2(subtotal * VAT_RATE)
  const final = r2(subtotal + tax)

  const dueDays = input.due_days ?? 14
  const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // Auto-foreslået label hvis operatør ikke har valgt en
  const label =
    input.stage_label?.trim() ||
    (input.invoice_type === 'deposit'
      ? 'Forskud'
      : (() => {
          const progressCount = (existingStages ?? []).filter(
            // billing_percentage is set on percent-progress; standard's
            // own progress (lines-mode) might have NULL — count both.
            () => true
          ).length
          return `Rate ${progressCount + 1}`
        })())

  const basisLabel =
    input.amount_basis === 'contract_sum' ? 'kontraktsum' : 'revideret beløb'

  // 6. INSERT invoice header
  const { data: header, error: hdrErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_id: sag.customer_id,
      case_id: sag.id,
      status: 'draft' as const,
      payment_status: 'pending' as const,
      invoice_type: input.invoice_type,
      amount_basis: input.amount_basis,
      amount_basis_value: r2(basisValue),
      billing_percentage: pct,
      stage_label: label,
      is_final_invoice: false,
      total_amount: subtotal,
      tax_amount: tax,
      final_amount: final,
      amount_paid: 0,
      currency: 'DKK',
      due_date: dueDate,
      reminder_count: 0,
      notes: input.notes?.trim() || null,
    })
    .select('id, invoice_number')
    .single()
  if (hdrErr || !header) {
    return { ...empty, message: `Kunne ikke oprette faktura-header: ${hdrErr?.message ?? 'ukendt'}` }
  }

  // 7. INSERT én fritekst-linje
  const description =
    input.invoice_type === 'deposit'
      ? `Forskud ${pct.toLocaleString('da-DK')} % af ${basisLabel}`
      : `${label} (${pct.toLocaleString('da-DK')} % af ${basisLabel})`
  const { error: lineErr } = await supabase
    .from('invoice_lines')
    .insert({
      invoice_id: header.id,
      position: 1,
      description,
      quantity: 1,
      unit: 'stk',
      unit_price: subtotal,
      total_price: subtotal,
    })
  if (lineErr) {
    // Roll back header — no half-row
    await supabase.from('invoices').delete().eq('id', header.id)
    return {
      ...empty,
      message: `Kunne ikke oprette linje (faktura rullet tilbage): ${lineErr.message}`,
    }
  }

  logger.info('stage invoice created', {
    entity: 'invoices',
    entityId: header.id,
    metadata: {
      case_id: sag.id,
      invoice_type: input.invoice_type,
      billing_percentage: pct,
      amount_basis_value: basisValue,
      created_by: approverId,
    },
  })

  return {
    ok: true,
    message: `${label} oprettet (${invoiceNumber})`,
    invoice_id: header.id,
    invoice_number: header.invoice_number,
    total_amount: subtotal,
    tax_amount: tax,
    final_amount: final,
    cumulative_percentage_after: cumulativeAfter,
  }
}

// =====================================================
// createFinalInvoiceForCase — slutfaktura med fradrag
// =====================================================

export interface CreateFinalInvoiceInput {
  case_id: string
  /** When true: also pull un-billed time_logs / case_materials /
      case_other_costs as positive lines on the final. Default true. */
  include_unbilled_lines?: boolean
  due_days?: number
  notes?: string | null
}

export interface CreateFinalInvoiceResult {
  ok: boolean
  message: string
  invoice_id: string | null
  invoice_number: string | null
  predecessor_count: number
  deduction_total: number
  unbilled_lines_count: number
  total_amount: number | null
  tax_amount: number | null
  final_amount: number | null
}

export async function createFinalInvoiceForCase(
  input: CreateFinalInvoiceInput,
  approverId: string
): Promise<CreateFinalInvoiceResult> {
  const supabase = createAdminClient()
  const includeLines = input.include_unbilled_lines !== false
  const empty: CreateFinalInvoiceResult = {
    ok: false,
    message: '',
    invoice_id: null,
    invoice_number: null,
    predecessor_count: 0,
    deduction_total: 0,
    unbilled_lines_count: 0,
    total_amount: null,
    tax_amount: null,
    final_amount: null,
  }

  // 1. Sag + customer
  const { data: sag } = await supabase
    .from('service_cases')
    .select('id, case_number, customer_id')
    .eq('id', input.case_id)
    .maybeSingle()
  if (!sag) return { ...empty, message: 'Sag ikke fundet' }
  if (!sag.customer_id) return { ...empty, message: 'Sagen mangler en kunde' }

  // 2. Slut-gate (UNIQUE-index er autoritativ men vi giver pænere fejl)
  const { data: existingFinal } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('case_id', input.case_id)
    .eq('is_final_invoice', true)
    .maybeSingle()
  if (existingFinal) {
    return {
      ...empty,
      message: `Slutfaktura findes allerede på sagen (${existingFinal.invoice_number})`,
    }
  }

  // 3. Find forgængere (deposit + progress) — ekskl. cancelled
  const { data: predecessors } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, invoice_type, status')
    .eq('case_id', input.case_id)
    .in('invoice_type', ['deposit', 'progress'])
    .neq('status', 'rejected' as never)
  const predRows = (predecessors ?? []) as Array<{
    id: string
    invoice_number: string
    total_amount: number | string | null
    invoice_type: string
    status: string
  }>

  // 4. Pull un-billed source rows (when allowed)
  let unbilledLinesCount = 0
  let positiveSubtotal = 0
  type LinePlan = {
    description: string
    quantity: number
    unit: string
    unit_price: number
    total_price: number
    source_time_log_id?: string | null
    source_case_material_id?: string | null
    source_case_other_cost_id?: string | null
  }
  const lines: LinePlan[] = []

  if (includeLines) {
    // Reuse the same gating as Sprint 6B's listUnbilled — pulled inline
    // here to avoid a circular import.
    const { data: wos } = await supabase
      .from('work_orders')
      .select('id')
      .eq('case_id', sag.id)
    const woIds = (wos ?? []).map((w) => w.id as string)

    type TimeLogJoin = {
      id: string
      hours: number | string | null
      end_time: string | null
      billable: boolean
      invoice_line_id: string | null
      employee:
        | { name: string | null; hourly_rate: number | string | null }
        | { name: string | null; hourly_rate: number | string | null }[]
        | null
    }
    const [tlRes, cmRes, ocRes] = await Promise.all([
      woIds.length === 0
        ? Promise.resolve({ data: [] as TimeLogJoin[] })
        : supabase
            .from('time_logs')
            .select(
              'id, hours, end_time, billable, invoice_line_id, employee:employees(name, hourly_rate)'
            )
            .in('work_order_id', woIds)
            .is('invoice_line_id', null)
            .not('end_time', 'is', null)
            .eq('billable', true)
            .order('start_time', { ascending: true }),
      supabase
        .from('case_materials')
        .select('id, description, quantity, unit, unit_sales_price, total_sales_price, billable, invoice_line_id')
        .eq('case_id', sag.id)
        .is('invoice_line_id', null)
        .eq('billable', true),
      supabase
        .from('case_other_costs')
        .select('id, description, quantity, unit, unit_sales_price, total_sales_price, billable, invoice_line_id')
        .eq('case_id', sag.id)
        .is('invoice_line_id', null)
        .eq('billable', true),
    ])

    const timeRows = (tlRes.data ?? []) as unknown as TimeLogJoin[]
    for (const t of timeRows) {
      const hours = Number(t.hours ?? 0)
      const emp = Array.isArray(t.employee) ? t.employee[0] : t.employee
      const rate = emp?.hourly_rate == null ? 650 : Number(emp.hourly_rate)
      if (!Number.isFinite(hours) || hours <= 0) continue
      const total = r2(hours * rate)
      lines.push({
        description: `Timer (${hours.toLocaleString('da-DK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} t) — ${emp?.name ?? 'Medarbejder'}`,
        quantity: hours,
        unit: 't',
        unit_price: rate,
        total_price: total,
        source_time_log_id: t.id,
      })
      positiveSubtotal += total
      unbilledLinesCount += 1
    }

    for (const m of (cmRes.data ?? []) as Array<{
      id: string
      description: string
      quantity: number | string
      unit: string
      unit_sales_price: number | string
      total_sales_price: number | string
    }>) {
      const total = Number(m.total_sales_price)
      lines.push({
        description: m.description,
        quantity: Number(m.quantity),
        unit: m.unit,
        unit_price: Number(m.unit_sales_price),
        total_price: total,
        source_case_material_id: m.id,
      })
      positiveSubtotal += total
      unbilledLinesCount += 1
    }

    for (const o of (ocRes.data ?? []) as Array<{
      id: string
      description: string
      quantity: number | string
      unit: string
      unit_sales_price: number | string
      total_sales_price: number | string
    }>) {
      const total = Number(o.total_sales_price)
      lines.push({
        description: o.description,
        quantity: Number(o.quantity),
        unit: o.unit,
        unit_price: Number(o.unit_sales_price),
        total_price: total,
        source_case_other_cost_id: o.id,
      })
      positiveSubtotal += total
      unbilledLinesCount += 1
    }
  }

  // 5. Build deduction lines (negative — DB has no CHECK forbidding it)
  let deductionTotal = 0
  for (const p of predRows) {
    const amt = Number(p.total_amount ?? 0)
    if (amt <= 0) continue
    deductionTotal += amt
    lines.push({
      description: `Fradrag: ${p.invoice_number} (${p.invoice_type === 'deposit' ? 'forskud' : 'rate'})`,
      quantity: 1,
      unit: 'stk',
      unit_price: -amt,
      total_price: -amt,
    })
  }

  if (lines.length === 0) {
    return {
      ...empty,
      message:
        predRows.length === 0
          ? 'Ingen ufakturerede linjer og ingen forgængere — slutfaktura ville være tom'
          : 'Ingen linjer at oprette',
      predecessor_count: predRows.length,
      deduction_total: r2(deductionTotal),
      unbilled_lines_count: unbilledLinesCount,
    }
  }

  // 6. Allokér nummer
  const { data: numData, error: numErr } = await supabase.rpc('allocate_invoice_number')
  if (numErr || !numData) {
    return { ...empty, message: `Kunne ikke allokere fakturanummer: ${numErr?.message ?? 'ukendt'}` }
  }
  const invoiceNumber = String(numData)

  // 7. Beregn totaler
  const subtotal = r2(positiveSubtotal - deductionTotal)
  // Moms beregnes på subtotal efter fradrag — hvis kunden har fået
  // forskud med moms, så er den allerede afregnet på de tidligere
  // fakturaer. Slutfakturaens moms = 25 % af nettobeløbet kunden
  // skal betale her.
  const tax = r2(subtotal * VAT_RATE)
  const final = r2(subtotal + tax)

  const dueDays = input.due_days ?? 14
  const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // 8. INSERT invoice header med UNIQUE-guard via DB
  const { data: header, error: hdrErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_id: sag.customer_id,
      case_id: sag.id,
      status: 'draft' as const,
      payment_status: 'pending' as const,
      invoice_type: 'final' as const,
      amount_basis: 'lines' as const,
      is_final_invoice: true,
      stage_label: 'Slutfaktura',
      total_amount: subtotal,
      tax_amount: tax,
      final_amount: final,
      amount_paid: 0,
      currency: 'DKK',
      due_date: dueDate,
      reminder_count: 0,
      notes: input.notes?.trim() || null,
    })
    .select('id, invoice_number')
    .single()
  if (hdrErr || !header) {
    const code = (hdrErr as { code?: string } | null)?.code
    if (code === '23505') {
      return {
        ...empty,
        message: 'Slutfaktura findes allerede på sagen (race detected)',
      }
    }
    return { ...empty, message: `Kunne ikke oprette slutfaktura-header: ${hdrErr?.message ?? 'ukendt'}` }
  }

  // 9. INSERT linjer (positive + negative fradrag) i én batch
  const lineRows = lines.map((l, i) => ({
    invoice_id: header.id,
    position: i + 1,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unit_price: l.unit_price,
    total_price: l.total_price,
    source_time_log_id: l.source_time_log_id ?? null,
    source_case_material_id: l.source_case_material_id ?? null,
    source_case_other_cost_id: l.source_case_other_cost_id ?? null,
  }))
  const { error: linesErr } = await supabase.from('invoice_lines').insert(lineRows)
  if (linesErr) {
    await supabase.from('invoices').delete().eq('id', header.id)
    return {
      ...empty,
      message: `Linje-INSERT fejlede (faktura rullet tilbage): ${linesErr.message}`,
    }
  }

  // 10. Bind forward-link på source rows (race-safe)
  // Pulles fresh så vi har de UUIDs invoice_lines fik. Vi kan ikke
  // bruge lineRows.id pga ingen returning — gør én ekstra SELECT.
  const { data: insertedLines } = await supabase
    .from('invoice_lines')
    .select('id, source_time_log_id, source_case_material_id, source_case_other_cost_id')
    .eq('invoice_id', header.id)
  const tlMap = new Map<string, string>()
  const cmMap = new Map<string, string>()
  const ocMap = new Map<string, string>()
  for (const il of (insertedLines ?? []) as Array<{
    id: string
    source_time_log_id: string | null
    source_case_material_id: string | null
    source_case_other_cost_id: string | null
  }>) {
    if (il.source_time_log_id) tlMap.set(il.source_time_log_id, il.id)
    if (il.source_case_material_id) cmMap.set(il.source_case_material_id, il.id)
    if (il.source_case_other_cost_id) ocMap.set(il.source_case_other_cost_id, il.id)
  }
  for (const [srcId, lineId] of tlMap) {
    await supabase
      .from('time_logs')
      .update({ invoice_line_id: lineId })
      .eq('id', srcId)
      .is('invoice_line_id', null)
  }
  for (const [srcId, lineId] of cmMap) {
    await supabase
      .from('case_materials')
      .update({ invoice_line_id: lineId })
      .eq('id', srcId)
      .is('invoice_line_id', null)
  }
  for (const [srcId, lineId] of ocMap) {
    await supabase
      .from('case_other_costs')
      .update({ invoice_line_id: lineId })
      .eq('id', srcId)
      .is('invoice_line_id', null)
  }

  // 11. Insert invoice_predecessors med snapshot
  if (predRows.length > 0) {
    const predRowsToInsert = predRows.map((p) => ({
      invoice_id: header.id,
      predecessor_invoice_id: p.id,
      deduction_amount: Number(p.total_amount ?? 0),
    }))
    const { error: predErr } = await supabase
      .from('invoice_predecessors')
      .insert(predRowsToInsert)
    if (predErr) {
      logger.warn('predecessor link insert failed (final invoice still created)', {
        entityId: header.id,
        error: predErr,
      })
    }
  }

  logger.info('final invoice created', {
    entity: 'invoices',
    entityId: header.id,
    metadata: {
      case_id: sag.id,
      predecessor_count: predRows.length,
      deduction_total: r2(deductionTotal),
      unbilled_lines_count: unbilledLinesCount,
      created_by: approverId,
    },
  })

  return {
    ok: true,
    message:
      `Slutfaktura ${header.invoice_number} oprettet med ${unbilledLinesCount} linje${
        unbilledLinesCount === 1 ? '' : 'r'
      } og ${predRows.length} fradrag (i alt ${r2(deductionTotal).toLocaleString('da-DK')} kr)`,
    invoice_id: header.id,
    invoice_number: header.invoice_number,
    predecessor_count: predRows.length,
    deduction_total: r2(deductionTotal),
    unbilled_lines_count: unbilledLinesCount,
    total_amount: subtotal,
    tax_amount: tax,
    final_amount: final,
  }
}

// =====================================================
// listStageInvoicesForCase — alle stage-fakturaer på sagen
// =====================================================

export interface StageInvoiceSummary {
  id: string
  invoice_number: string
  invoice_type: InvoiceType
  status: 'draft' | 'sent' | 'paid'
  stage_label: string | null
  amount_basis: AmountBasis
  amount_basis_value: number | null
  billing_percentage: number | null
  total_amount: number
  tax_amount: number
  final_amount: number
  is_final_invoice: boolean
  created_at: string
  due_date: string | null
}

export async function listStageInvoicesForCase(
  caseId: string
): Promise<{ ok: boolean; message?: string; data?: StageInvoiceSummary[] }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_type, status, stage_label, amount_basis, ' +
        'amount_basis_value, billing_percentage, total_amount, tax_amount, ' +
        'final_amount, is_final_invoice, created_at, due_date'
    )
    .eq('case_id', caseId)
    .in('invoice_type', ['deposit', 'progress', 'final'])
    .order('created_at', { ascending: true })
  if (error) {
    return { ok: false, message: error.message }
  }
  type RawRow = {
    id: string
    invoice_number: string
    invoice_type: string
    status: string
    stage_label: string | null
    amount_basis: string
    amount_basis_value: number | string | null
    billing_percentage: number | string | null
    total_amount: number | string
    tax_amount: number | string
    final_amount: number | string
    is_final_invoice: boolean
    created_at: string
    due_date: string | null
  }
  const raw = (data ?? []) as unknown as RawRow[]
  const rows: StageInvoiceSummary[] = raw.map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    invoice_type: r.invoice_type as InvoiceType,
    status: r.status as 'draft' | 'sent' | 'paid',
    stage_label: r.stage_label,
    amount_basis: r.amount_basis as AmountBasis,
    amount_basis_value: r.amount_basis_value == null ? null : Number(r.amount_basis_value),
    billing_percentage: r.billing_percentage == null ? null : Number(r.billing_percentage),
    total_amount: Number(r.total_amount),
    tax_amount: Number(r.tax_amount),
    final_amount: Number(r.final_amount),
    is_final_invoice: !!r.is_final_invoice,
    created_at: r.created_at,
    due_date: r.due_date,
  }))
  return { ok: true, data: rows }
}

// Re-exports so /actions can pass through types without circular imports
export type { InvoiceRow as _InvoiceRow, InvoiceLineRow as _InvoiceLineRow }
