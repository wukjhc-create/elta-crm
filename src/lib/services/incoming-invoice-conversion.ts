/**
 * Sprint 5E-3 — Convert approved supplier invoice lines into
 * case_materials / case_other_costs.
 *
 * Server-side orchestrator called from approveIncomingInvoiceWithPlan
 * (in src/lib/actions/incoming-invoices.ts).
 *
 * Idempotency:
 *   - Each invoice line carries converted_case_material_id /
 *     converted_case_other_cost_id (mig 00103). UNIQUE partial indexes
 *     guarantee a line can map to at most one downstream row.
 *   - We treat "line already has converted_at set" as already-converted
 *     and skip — re-running the action is safe.
 *
 * Failure mode:
 *   - If any conversion INSERT fails, we DO NOT flip the invoice to
 *     'approved'. The caller (action) sees the error and the invoice
 *     stays 'awaiting_approval' so the operator can retry.
 *   - We continue past one bad line: each line is its own try/catch.
 *     The result reports per-line success/failure so the UI can show
 *     "3 of 5 lines converted, 2 failed" instead of silent partial
 *     state.
 *
 * No e-conomic push, no fake numbers, no auto-margin.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { CaseOtherCostCategory } from '@/types/case-other-costs.types'

export type LineDisposition = 'material' | 'other_cost' | 'skip'

export interface LinePlanInput {
  lineId: string
  disposition: LineDisposition
  category?: CaseOtherCostCategory
}

export interface PerLineResult {
  lineId: string
  disposition: LineDisposition
  ok: boolean
  /** kind of row created (when ok && not skipped) */
  createdAs?: 'material' | 'other_cost' | null
  createdId?: string
  /** present when already converted in a previous run (idempotent path) */
  alreadyConverted?: boolean
  message?: string
}

export interface ConvertAndApproveResult {
  ok: boolean
  message: string
  invoiceStatusFlipped: boolean
  perLine: PerLineResult[]
  caseId: string | null
}

/**
 * Snapshot fields captured at insert time. Cost is read off the line;
 * sale defaults to 0 (operator sets it later — see Sprint 5B/5C UI).
 */
function lineSnapshot(line: {
  description: string | null
  quantity: number | string | null
  unit: string | null
  unit_price: number | string | null
  total_price: number | string | null
}): {
  description: string
  quantity: number
  unit: string
  unit_cost: number
} {
  const description = (line.description ?? '').trim() || 'Linje uden beskrivelse'
  const qRaw = Number(line.quantity ?? 0)
  const quantity = Number.isFinite(qRaw) && qRaw > 0 ? qRaw : 1
  const unit = (line.unit ?? '').trim() || 'stk'
  const upRaw = Number(line.unit_price ?? 0)
  let unit_cost = Number.isFinite(upRaw) && upRaw >= 0 ? upRaw : 0
  // Fall back to total / qty when unit_price is missing.
  if (unit_cost === 0) {
    const tpRaw = Number(line.total_price ?? 0)
    if (Number.isFinite(tpRaw) && tpRaw > 0 && quantity > 0) {
      unit_cost = Math.round((tpRaw / quantity) * 100) / 100
    }
  }
  return { description, quantity, unit, unit_cost }
}

export async function convertAndApproveInvoice(
  invoiceId: string,
  approverId: string,
  plan: LinePlanInput[],
  options: { acknowledgeReview?: boolean } = {}
): Promise<ConvertAndApproveResult> {
  const supabase = createAdminClient()
  const perLine: PerLineResult[] = []

  // 1. Read invoice header
  const { data: invoice, error: invErr } = await supabase
    .from('incoming_invoices')
    .select(`
      id, status, requires_manual_review,
      matched_case_id, matched_work_order_id,
      supplier_id, supplier_name_extracted, invoice_number, currency
    `)
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr || !invoice) {
    return {
      ok: false,
      message: 'Faktura ikke fundet',
      invoiceStatusFlipped: false,
      perLine,
      caseId: null,
    }
  }

  // 2. Status gate — must be in a non-terminal pre-approve state
  const validStatuses = ['received', 'awaiting_approval']
  if (!validStatuses.includes(invoice.status as string)) {
    return {
      ok: false,
      message: `Faktura er ${invoice.status} — kan ikke godkendes igen`,
      invoiceStatusFlipped: false,
      perLine,
      caseId: invoice.matched_case_id as string | null,
    }
  }

  // 3. Manual review gate (mirrors approveInvoice)
  if (invoice.requires_manual_review && !options.acknowledgeReview) {
    return {
      ok: false,
      message: 'Faktura kræver manuel gennemgang. Bekræft eksplicit.',
      invoiceStatusFlipped: false,
      perLine,
      caseId: invoice.matched_case_id as string | null,
    }
  }

  // 4. Sag-gate — converter must have a sag to attach to
  if (!invoice.matched_case_id) {
    return {
      ok: false,
      message: 'Match fakturaen til en sag før godkendelse',
      invoiceStatusFlipped: false,
      perLine,
      caseId: null,
    }
  }
  const caseId = invoice.matched_case_id as string

  // 5. Resolve supplier display name (prefer canonical row over parsed)
  let supplierDisplayName: string | null = invoice.supplier_name_extracted ?? null
  if (invoice.supplier_id) {
    const { data: sup } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', invoice.supplier_id)
      .maybeSingle()
    if (sup?.name) supplierDisplayName = sup.name
  }

  // 6. Load all invoice lines (we need the snapshots + already-converted state)
  const { data: lineRows, error: linesErr } = await supabase
    .from('incoming_invoice_lines')
    .select(`
      id, line_number, description, quantity, unit, unit_price, total_price,
      supplier_product_id,
      converted_case_material_id, converted_case_other_cost_id, converted_at
    `)
    .eq('incoming_invoice_id', invoiceId)
  if (linesErr) {
    logger.error('convertAndApprove: line read failed', { error: linesErr, entityId: invoiceId })
    return {
      ok: false,
      message: 'Kunne ikke læse fakturalinjer',
      invoiceStatusFlipped: false,
      perLine,
      caseId,
    }
  }

  const linesById = new Map(
    (lineRows ?? []).map((l) => [l.id as string, l])
  )

  // Validate every plan entry references a real line on this invoice.
  for (const p of plan) {
    if (!linesById.has(p.lineId)) {
      perLine.push({
        lineId: p.lineId,
        disposition: p.disposition,
        ok: false,
        message: 'Linje hører ikke til denne faktura',
      })
    }
  }
  if (perLine.length > 0) {
    return {
      ok: false,
      message: 'Plan indeholder ukendte linjer',
      invoiceStatusFlipped: false,
      perLine,
      caseId,
    }
  }

  // 7. Convert each line per plan
  let conversionFatal = false
  for (const p of plan) {
    const line = linesById.get(p.lineId)!

    // Idempotent skip if already converted in a prior run
    if (line.converted_at || line.converted_case_material_id || line.converted_case_other_cost_id) {
      perLine.push({
        lineId: p.lineId,
        disposition: p.disposition,
        ok: true,
        alreadyConverted: true,
        createdAs: line.converted_case_material_id
          ? 'material'
          : line.converted_case_other_cost_id
          ? 'other_cost'
          : null,
        message: 'Allerede konverteret',
      })
      continue
    }

    if (p.disposition === 'skip') {
      // Mark skipped lines so the "unconverted" flag clears.
      // We use converted_at + null FK pair to signal "explicitly skipped".
      const { error: skipErr } = await supabase
        .from('incoming_invoice_lines')
        .update({
          converted_at: new Date().toISOString(),
          converted_by: approverId,
        })
        .eq('id', p.lineId)
        .is('converted_at', null)        // race-safe
      if (skipErr) {
        perLine.push({
          lineId: p.lineId,
          disposition: 'skip',
          ok: false,
          message: skipErr.message,
        })
        conversionFatal = true
        continue
      }
      perLine.push({
        lineId: p.lineId,
        disposition: 'skip',
        ok: true,
        message: 'Sprunget over',
      })
      continue
    }

    const snap = lineSnapshot(line)
    const invoiceRefNote =
      `Fra leverandørfaktura ${invoice.invoice_number ?? invoice.id.slice(0, 8)}`

    if (p.disposition === 'material') {
      const { data: cm, error: cmErr } = await supabase
        .from('case_materials')
        .insert({
          case_id: caseId,
          supplier_product_id: line.supplier_product_id ?? null,
          description: snap.description,
          sku_snapshot: null,
          supplier_name_snapshot: supplierDisplayName,
          unit: snap.unit,
          quantity: snap.quantity,
          unit_cost: snap.unit_cost,
          unit_sales_price: 0,        // operator sets later — Sprint 5B UI
          source: 'supplier_invoice',
          source_incoming_invoice_line_id: line.id,
          billable: true,
          notes: invoiceRefNote,
          created_by: approverId,
        })
        .select('id')
        .single()
      if (cmErr || !cm) {
        perLine.push({
          lineId: p.lineId,
          disposition: 'material',
          ok: false,
          message: cmErr?.message ?? 'INSERT failed',
        })
        conversionFatal = true
        continue
      }
      // Reverse-link the invoice line. The UNIQUE partial index
      // guards against double conversion.
      const { error: bindErr } = await supabase
        .from('incoming_invoice_lines')
        .update({
          converted_case_material_id: cm.id,
          converted_at: new Date().toISOString(),
          converted_by: approverId,
        })
        .eq('id', p.lineId)
        .is('converted_case_material_id', null)
      if (bindErr) {
        // Couldn't bind — best effort cleanup of the orphan case_material.
        await supabase.from('case_materials').delete().eq('id', cm.id)
        perLine.push({
          lineId: p.lineId,
          disposition: 'material',
          ok: false,
          message: bindErr.message,
        })
        conversionFatal = true
        continue
      }
      perLine.push({
        lineId: p.lineId,
        disposition: 'material',
        ok: true,
        createdAs: 'material',
        createdId: cm.id,
      })
      continue
    }

    if (p.disposition === 'other_cost') {
      const category: CaseOtherCostCategory = (p.category ?? 'andet') as CaseOtherCostCategory
      const { data: oc, error: ocErr } = await supabase
        .from('case_other_costs')
        .insert({
          case_id: caseId,
          category,
          description: snap.description,
          supplier_name: supplierDisplayName,
          unit: snap.unit,
          quantity: snap.quantity,
          unit_cost: snap.unit_cost,
          unit_sales_price: 0,
          source: 'supplier_invoice',
          source_incoming_invoice_line_id: line.id,
          billable: true,
          notes: invoiceRefNote,
          created_by: approverId,
        })
        .select('id')
        .single()
      if (ocErr || !oc) {
        perLine.push({
          lineId: p.lineId,
          disposition: 'other_cost',
          ok: false,
          message: ocErr?.message ?? 'INSERT failed',
        })
        conversionFatal = true
        continue
      }
      const { error: bindErr } = await supabase
        .from('incoming_invoice_lines')
        .update({
          converted_case_other_cost_id: oc.id,
          converted_at: new Date().toISOString(),
          converted_by: approverId,
        })
        .eq('id', p.lineId)
        .is('converted_case_other_cost_id', null)
      if (bindErr) {
        await supabase.from('case_other_costs').delete().eq('id', oc.id)
        perLine.push({
          lineId: p.lineId,
          disposition: 'other_cost',
          ok: false,
          message: bindErr.message,
        })
        conversionFatal = true
        continue
      }
      perLine.push({
        lineId: p.lineId,
        disposition: 'other_cost',
        ok: true,
        createdAs: 'other_cost',
        createdId: oc.id,
      })
      continue
    }

    // Unknown disposition — defensive
    perLine.push({
      lineId: p.lineId,
      disposition: p.disposition,
      ok: false,
      message: `Ukendt disposition: ${p.disposition}`,
    })
    conversionFatal = true
  }

  // 8. Audit log per conversion (best-effort)
  for (const r of perLine) {
    try {
      await supabase.from('incoming_invoice_audit_log').insert({
        incoming_invoice_id: invoiceId,
        action:
          r.disposition === 'material'
            ? 'converted_to_case_material'
            : r.disposition === 'other_cost'
            ? 'converted_to_case_other_cost'
            : 'line_skipped',
        actor_id: approverId,
        ok: r.ok,
        new_value: {
          line_id: r.lineId,
          created_id: r.createdId ?? null,
          already_converted: r.alreadyConverted ?? false,
        },
        message: r.message ?? null,
      })
    } catch {
      /* best-effort */
    }
  }

  // 9. Decide whether to flip status
  if (conversionFatal) {
    return {
      ok: false,
      message:
        'Konvertering fejlede på en eller flere linjer. Faktura forbliver awaiting_approval.',
      invoiceStatusFlipped: false,
      perLine,
      caseId,
    }
  }

  // 10. Flip status to approved (race-safe)
  const { error: statusErr } = await supabase
    .from('incoming_invoices')
    .update({
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('status', invoice.status as string)
  if (statusErr) {
    return {
      ok: false,
      message: `Linjer konverteret, men status-skift fejlede: ${statusErr.message}`,
      invoiceStatusFlipped: false,
      perLine,
      caseId,
    }
  }

  // 11. Final audit: approved
  try {
    await supabase.from('incoming_invoice_audit_log').insert({
      incoming_invoice_id: invoiceId,
      action: 'approved',
      actor_id: approverId,
      previous_value: { status: invoice.status },
      new_value: { status: 'approved' },
      ok: true,
      message: `approved by ${approverId} (${perLine.length} linjer behandlet)`,
    })
  } catch {
    /* best-effort */
  }

  // NOTE: e-conomic push is intentionally skipped here. The legacy
  // approveInvoice path still pushes (and currently no-ops because
  // settings empty); we keep it out of this code path so Sprint 5E-3
  // does not silently start posting once settings get configured.
  // Henrik's spec for tonight: "Ingen e-conomic push/bogføring endnu".

  const successCount = perLine.filter((r) => r.ok && !r.alreadyConverted).length
  const skippedAlready = perLine.filter((r) => r.alreadyConverted).length
  return {
    ok: true,
    message:
      `Faktura godkendt. ${successCount} ${successCount === 1 ? 'linje' : 'linjer'} konverteret` +
      (skippedAlready > 0 ? ` (${skippedAlready} allerede konverteret)` : ''),
    invoiceStatusFlipped: true,
    perLine,
    caseId,
  }
}
