/**
 * Sprint 6B-2 — createInvoiceDraftFromCase
 *
 * Builds an internal invoice DRAFT (status='draft') from selected
 * un-billed time_logs / case_materials / case_other_costs on a sag.
 *
 * Idempotency contract:
 *   - Forward-link check: skip a source row whose invoice_line_id is
 *     already set (Phase 7.1 + Sprint 5B/5C convention).
 *   - DB-level guard: invoice_lines.source_*_id has UNIQUE PARTIAL
 *     indexes (mig 00104). A second INSERT with the same source FK
 *     fails with code 23505 — service catches and reports.
 *   - Both layers run; the DB constraint is the authoritative guard.
 *
 * No e-conomic, no PDF, no email, no multi-stage. Pure compose.
 *
 * Failure semantics:
 *   - If 0 lines could be created (everything skipped, every line
 *     errored, or selection empty after gating): we delete the
 *     header row we just created and return ok:false. No half-row
 *     left behind.
 *   - If at least 1 line was created: we keep the invoice and
 *     report the per-line skips/errors so the operator sees what
 *     was excluded.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export interface CaseInvoiceSelection {
  time_log_ids?: string[]
  case_material_ids?: string[]
  case_other_cost_ids?: string[]
}

export interface CaseInvoiceOptions {
  due_days?: number
  notes?: string | null
  /** Default 25 (Danish standard rate). Override only for unusual cases. */
  vat_rate?: number
  /** Fallback hourly rate used when employees.hourly_rate is null. Default 650. */
  default_hourly_rate?: number
}

export type SkipReason =
  | 'already_billed'
  | 'open_timer'
  | 'not_billable'
  | 'missing_employee_rate'
  | 'not_found'
  | 'belongs_to_different_case'
  | 'invalid_source_kind'
  | 'unique_violation'
  | 'insert_failed'

export interface SkippedLine {
  kind: 'time_log' | 'case_material' | 'case_other_cost'
  source_id: string
  reason: SkipReason
  detail?: string
}

export interface CreatedLine {
  kind: 'time_log' | 'case_material' | 'case_other_cost'
  source_id: string
  invoice_line_id: string
  total_price: number
}

export interface CreateInvoiceDraftResult {
  ok: boolean
  message: string
  invoice_id: string | null
  invoice_number: string | null
  created_lines: CreatedLine[]
  skipped_lines: SkippedLine[]
  totals: {
    subtotal: number
    vat: number
    final: number
  } | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export async function createInvoiceDraftFromCase(
  caseId: string,
  approverId: string,
  selection: CaseInvoiceSelection,
  options: CaseInvoiceOptions = {}
): Promise<CreateInvoiceDraftResult> {
  const supabase = createAdminClient()
  const skipped: SkippedLine[] = []
  const created: CreatedLine[] = []

  const timeLogIds = Array.from(new Set(selection.time_log_ids ?? []))
  const matIds = Array.from(new Set(selection.case_material_ids ?? []))
  const ocIds = Array.from(new Set(selection.case_other_cost_ids ?? []))

  if (timeLogIds.length === 0 && matIds.length === 0 && ocIds.length === 0) {
    return {
      ok: false,
      message: 'Ingen linjer valgt',
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }

  const vatRate = (options.vat_rate ?? 25) / 100
  const defaultHourlyRate = options.default_hourly_rate ?? 650
  const dueDays = options.due_days ?? 14

  // ---- 1. Validate sag + customer ----
  const { data: sag, error: sagErr } = await supabase
    .from('service_cases')
    .select('id, customer_id, case_number')
    .eq('id', caseId)
    .maybeSingle()
  if (sagErr || !sag) {
    return {
      ok: false,
      message: 'Sag ikke fundet',
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }
  if (!sag.customer_id) {
    return {
      ok: false,
      message: 'Sagen mangler en kunde — kan ikke fakturere',
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }

  // ---- 2. Allocate invoice number ----
  const { data: numData, error: numErr } = await supabase.rpc('allocate_invoice_number')
  if (numErr || !numData) {
    logger.error('allocate_invoice_number failed', { error: numErr, entityId: caseId })
    return {
      ok: false,
      message: `Kunne ikke allokere fakturanr: ${numErr?.message ?? 'ukendt'}`,
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }
  const invoiceNumber = String(numData)

  // ---- 3. Insert invoice header (totals filled in later) ----
  const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: header, error: hdrErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_id: sag.customer_id,
      case_id: sag.id,
      status: 'draft' as const,
      payment_status: 'pending' as const,
      total_amount: 0,
      tax_amount: 0,
      final_amount: 0,
      amount_paid: 0,
      currency: 'DKK',
      due_date: dueDate,
      reminder_count: 0,
      notes: options.notes ?? null,
    })
    .select('id, invoice_number')
    .single()
  if (hdrErr || !header) {
    logger.error('invoice draft header insert failed', { error: hdrErr, entityId: caseId })
    return {
      ok: false,
      message: `Kunne ikke oprette faktura-header: ${hdrErr?.message ?? 'ukendt'}`,
      invoice_id: null,
      invoice_number: invoiceNumber,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }

  let position = 0

  // =====================================================
  // Time logs
  // =====================================================
  if (timeLogIds.length > 0) {
    type TimeLogJoined = {
      id: string
      work_order_id: string | null
      employee_id: string | null
      hours: number | string | null
      end_time: string | null
      billable: boolean
      invoice_line_id: string | null
      sale_amount: number | string | null
      sale_rate_snapshot: number | string | null
      work_order:
        | { case_id: string | null }
        | { case_id: string | null }[]
        | null
      employee:
        | { name: string | null; hourly_rate: number | string | null }
        | { name: string | null; hourly_rate: number | string | null }[]
        | null
    }
    const { data: timeRowsRaw } = await supabase
      .from('time_logs')
      .select(
        'id, work_order_id, employee_id, hours, end_time, billable, invoice_line_id, ' +
          'sale_amount, sale_rate_snapshot, ' +
          'work_order:work_orders(case_id), employee:employees(name, hourly_rate)'
      )
      .in('id', timeLogIds)
    const timeRows = (timeRowsRaw ?? []) as unknown as TimeLogJoined[]
    const byId = new Map(timeRows.map((t) => [t.id, t]))

    for (const id of timeLogIds) {
      const tl = byId.get(id)
      if (!tl) {
        skipped.push({ kind: 'time_log', source_id: id, reason: 'not_found' })
        continue
      }
      const wo = Array.isArray(tl.work_order) ? tl.work_order[0] ?? null : tl.work_order
      if (!wo || wo.case_id !== sag.id) {
        skipped.push({
          kind: 'time_log',
          source_id: id,
          reason: 'belongs_to_different_case',
          detail: 'time_log er ikke koblet til en arbejdsordre på denne sag',
        })
        continue
      }
      if (tl.invoice_line_id) {
        skipped.push({ kind: 'time_log', source_id: id, reason: 'already_billed' })
        continue
      }
      if (tl.end_time === null) {
        skipped.push({ kind: 'time_log', source_id: id, reason: 'open_timer' })
        continue
      }
      if (!tl.billable) {
        skipped.push({ kind: 'time_log', source_id: id, reason: 'not_billable' })
        continue
      }

      const hours = Number(tl.hours ?? 0)
      const emp = Array.isArray(tl.employee) ? tl.employee[0] ?? null : tl.employee

      // Sprint Ø2.11 — fakturagrundlag bruger FROSSET salgssnapshot (sale_amount/
      // sale_rate_snapshot fra rate engine), så historiske timer ikke fakturere
      // med nye/live medarbejdersatser. Fallback til live hourly_rate kun for
      // ældre rækker uden snapshot.
      const saleSnap = tl.sale_amount == null ? null : Number(tl.sale_amount)
      const rateSnap = tl.sale_rate_snapshot == null ? null : Number(tl.sale_rate_snapshot)
      const useSnapshot = saleSnap != null && Number.isFinite(saleSnap)

      let rate: number
      if (useSnapshot && rateSnap != null && Number.isFinite(rateSnap)) {
        rate = rateSnap
      } else {
        const rateRaw = emp?.hourly_rate ?? null
        const liveRate = rateRaw == null ? null : Number(rateRaw)
        if (liveRate == null || !Number.isFinite(liveRate) || liveRate <= 0) {
          rate = defaultHourlyRate
          if (!useSnapshot) {
            skipped.push({
              kind: 'time_log',
              source_id: id,
              reason: 'missing_employee_rate',
              detail: `Bruger fallback ${defaultHourlyRate} kr/t — ${emp?.name ?? 'ukendt medarbejder'} mangler hourly_rate`,
            })
          }
        } else {
          rate = liveRate
        }
      }

      const totalPrice = useSnapshot ? r2(saleSnap as number) : r2(hours * rate)
      position += 1
      const empName = emp?.name ?? 'Medarbejder'
      const description = `Timer (${hours.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t) — ${empName}`

      const { data: line, error: lineErr } = await supabase
        .from('invoice_lines')
        .insert({
          invoice_id: header.id,
          position,
          description,
          quantity: hours,
          unit: 't',
          unit_price: rate,
          total_price: totalPrice,
          source_time_log_id: id,
        })
        .select('id')
        .single()
      if (lineErr || !line) {
        position -= 1
        const code = (lineErr as { code?: string } | null)?.code
        skipped.push({
          kind: 'time_log',
          source_id: id,
          reason: code === '23505' ? 'unique_violation' : 'insert_failed',
          detail: lineErr?.message ?? 'ukendt fejl',
        })
        continue
      }
      // Bind forward-link race-safely
      const { error: bindErr } = await supabase
        .from('time_logs')
        .update({ invoice_line_id: line.id })
        .eq('id', id)
        .is('invoice_line_id', null)
      if (bindErr) {
        await supabase.from('invoice_lines').delete().eq('id', line.id)
        position -= 1
        skipped.push({
          kind: 'time_log',
          source_id: id,
          reason: 'insert_failed',
          detail: `bind failed: ${bindErr.message}`,
        })
        continue
      }
      created.push({
        kind: 'time_log',
        source_id: id,
        invoice_line_id: line.id,
        total_price: totalPrice,
      })
    }
  }

  // =====================================================
  // Case materials
  // =====================================================
  if (matIds.length > 0) {
    const { data: matRows } = await supabase
      .from('case_materials')
      .select('id, case_id, description, quantity, unit, unit_sales_price, total_sales_price, billable, invoice_line_id')
      .in('id', matIds)
    const byId = new Map((matRows ?? []).map((m) => [m.id as string, m]))

    for (const id of matIds) {
      const m = byId.get(id)
      if (!m) {
        skipped.push({ kind: 'case_material', source_id: id, reason: 'not_found' })
        continue
      }
      if (m.case_id !== sag.id) {
        skipped.push({ kind: 'case_material', source_id: id, reason: 'belongs_to_different_case' })
        continue
      }
      if (m.invoice_line_id) {
        skipped.push({ kind: 'case_material', source_id: id, reason: 'already_billed' })
        continue
      }
      if (!m.billable) {
        skipped.push({ kind: 'case_material', source_id: id, reason: 'not_billable' })
        continue
      }

      position += 1
      const qty = Number(m.quantity)
      const unitPrice = Number(m.unit_sales_price)
      const totalPrice = Number(m.total_sales_price)
      const { data: line, error: lineErr } = await supabase
        .from('invoice_lines')
        .insert({
          invoice_id: header.id,
          position,
          description: m.description,
          quantity: qty,
          unit: m.unit,
          unit_price: unitPrice,
          total_price: totalPrice,
          source_case_material_id: id,
        })
        .select('id')
        .single()
      if (lineErr || !line) {
        position -= 1
        const code = (lineErr as { code?: string } | null)?.code
        skipped.push({
          kind: 'case_material',
          source_id: id,
          reason: code === '23505' ? 'unique_violation' : 'insert_failed',
          detail: lineErr?.message ?? 'ukendt fejl',
        })
        continue
      }
      const { error: bindErr } = await supabase
        .from('case_materials')
        .update({ invoice_line_id: line.id })
        .eq('id', id)
        .is('invoice_line_id', null)
      if (bindErr) {
        await supabase.from('invoice_lines').delete().eq('id', line.id)
        position -= 1
        skipped.push({
          kind: 'case_material',
          source_id: id,
          reason: 'insert_failed',
          detail: `bind failed: ${bindErr.message}`,
        })
        continue
      }
      created.push({
        kind: 'case_material',
        source_id: id,
        invoice_line_id: line.id,
        total_price: totalPrice,
      })
    }
  }

  // =====================================================
  // Case other costs
  // =====================================================
  if (ocIds.length > 0) {
    const { data: ocRows } = await supabase
      .from('case_other_costs')
      .select('id, case_id, description, category, quantity, unit, unit_sales_price, total_sales_price, billable, invoice_line_id')
      .in('id', ocIds)
    const byId = new Map((ocRows ?? []).map((o) => [o.id as string, o]))

    for (const id of ocIds) {
      const o = byId.get(id)
      if (!o) {
        skipped.push({ kind: 'case_other_cost', source_id: id, reason: 'not_found' })
        continue
      }
      if (o.case_id !== sag.id) {
        skipped.push({ kind: 'case_other_cost', source_id: id, reason: 'belongs_to_different_case' })
        continue
      }
      if (o.invoice_line_id) {
        skipped.push({ kind: 'case_other_cost', source_id: id, reason: 'already_billed' })
        continue
      }
      if (!o.billable) {
        skipped.push({ kind: 'case_other_cost', source_id: id, reason: 'not_billable' })
        continue
      }

      position += 1
      const qty = Number(o.quantity)
      const unitPrice = Number(o.unit_sales_price)
      const totalPrice = Number(o.total_sales_price)
      const { data: line, error: lineErr } = await supabase
        .from('invoice_lines')
        .insert({
          invoice_id: header.id,
          position,
          description: o.description,
          quantity: qty,
          unit: o.unit,
          unit_price: unitPrice,
          total_price: totalPrice,
          source_case_other_cost_id: id,
        })
        .select('id')
        .single()
      if (lineErr || !line) {
        position -= 1
        const code = (lineErr as { code?: string } | null)?.code
        skipped.push({
          kind: 'case_other_cost',
          source_id: id,
          reason: code === '23505' ? 'unique_violation' : 'insert_failed',
          detail: lineErr?.message ?? 'ukendt fejl',
        })
        continue
      }
      const { error: bindErr } = await supabase
        .from('case_other_costs')
        .update({ invoice_line_id: line.id })
        .eq('id', id)
        .is('invoice_line_id', null)
      if (bindErr) {
        await supabase.from('invoice_lines').delete().eq('id', line.id)
        position -= 1
        skipped.push({
          kind: 'case_other_cost',
          source_id: id,
          reason: 'insert_failed',
          detail: `bind failed: ${bindErr.message}`,
        })
        continue
      }
      created.push({
        kind: 'case_other_cost',
        source_id: id,
        invoice_line_id: line.id,
        total_price: totalPrice,
      })
    }
  }

  // =====================================================
  // Empty result → roll back the header
  // =====================================================
  if (created.length === 0) {
    await supabase.from('invoices').delete().eq('id', header.id)
    return {
      ok: false,
      message:
        'Ingen linjer kunne oprettes — fakturaen blev rullet tilbage. Tjek skipped_lines.',
      invoice_id: null,
      invoice_number: invoiceNumber,
      created_lines: [],
      skipped_lines: skipped,
      totals: null,
    }
  }

  // =====================================================
  // Compute totals and update header
  // =====================================================
  const subtotal = r2(created.reduce((s, c) => s + c.total_price, 0))
  const vat = r2(subtotal * vatRate)
  const final = r2(subtotal + vat)

  const { error: totErr } = await supabase
    .from('invoices')
    .update({
      total_amount: subtotal,
      tax_amount: vat,
      final_amount: final,
    })
    .eq('id', header.id)
  if (totErr) {
    logger.warn('invoice totals update failed', { error: totErr, entityId: header.id })
    // Do NOT roll back — the lines exist; operator can edit totals or contact admin.
  }

  // Sprint Ø3.2 — persistent audit i audit_logs (faktura oprettet fra sag +
  // antal låste linjer + total + bruger). Må aldrig vælte fakturaoprettelsen.
  try {
    await supabase.from('audit_logs').insert({
      user_id: approverId,
      entity_type: 'invoice',
      entity_id: header.id,
      entity_name: header.invoice_number,
      action: 'invoice_created_from_case',
      action_description:
        `Faktura ${header.invoice_number} oprettet fra sag med ${created.length} linje${created.length === 1 ? '' : 'r'} — total ${final} kr (inkl. moms)`,
      changes: { line_count: created.length, skipped_count: skipped.length },
      metadata: {
        case_id: sag.id,
        case_number: (sag as { case_number?: string }).case_number,
        subtotal, vat, final,
      },
    })
  } catch (e) {
    logger.error('audit invoice_created_from_case failed', { error: e, entityId: header.id })
  }

  logger.info('invoice draft created from case', {
    entity: 'invoices',
    entityId: header.id,
    metadata: {
      case_id: sag.id,
      case_number: (sag as { case_number?: string }).case_number,
      created_count: created.length,
      skipped_count: skipped.length,
      subtotal,
      vat,
      final,
      created_by: approverId,
    },
  })

  return {
    ok: true,
    message:
      `Faktura ${header.invoice_number} oprettet med ${created.length} linje${created.length === 1 ? '' : 'r'}` +
      (skipped.length > 0 ? ` (${skipped.length} sprunget over)` : ''),
    invoice_id: header.id,
    invoice_number: header.invoice_number,
    created_lines: created,
    skipped_lines: skipped,
    totals: { subtotal, vat, final },
  }
}
