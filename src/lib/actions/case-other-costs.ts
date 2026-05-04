'use server'

/**
 * Sprint 5C — case_other_costs server actions.
 *
 * Canonical "other costs" on a service_case. Snapshot pricing — once
 * a row is created, unit_cost / unit_sales_price are frozen. No live
 * catalog lookup. Delete + edit gated by invoice_line_id.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import {
  CASE_OTHER_COST_CATEGORIES,
  type CaseOtherCostCategory,
  type CaseOtherCostRow,
  type CaseOtherCostsSummary,
  type CaseOtherCostSource,
} from '@/types/case-other-costs.types'

const SELECT_COLUMNS = `
  id, case_id, work_order_id,
  category, description, supplier_name, cost_date, unit,
  quantity, unit_cost, unit_sales_price,
  total_cost, total_sales_price,
  receipt_url, receipt_filename,
  source, billable, invoice_line_id,
  notes, created_by, created_at, updated_at
`

const isCategory = (v: unknown): v is CaseOtherCostCategory =>
  typeof v === 'string' && (CASE_OTHER_COST_CATEGORIES as readonly string[]).includes(v)

// =====================================================
// Read
// =====================================================

export async function listCaseOtherCosts(
  caseId: string
): Promise<ActionResult<{ rows: CaseOtherCostRow[]; summary: CaseOtherCostsSummary }>> {
  try {
    validateUUID(caseId, 'case_id')
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('case_other_costs')
      .select(SELECT_COLUMNS)
      .eq('case_id', caseId)
      .order('cost_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      logger.error('listCaseOtherCosts failed', { error, entityId: caseId })
      return { success: false, error: 'Kunne ikke hente øvrige omkostninger' }
    }

    const rows = ((data ?? []) as CaseOtherCostRow[]).map((r) => ({
      ...r,
      cost_date: (r.cost_date ?? '').slice(0, 10),
      quantity: Number(r.quantity),
      unit_cost: Number(r.unit_cost),
      unit_sales_price: Number(r.unit_sales_price),
      total_cost: Number(r.total_cost),
      total_sales_price: Number(r.total_sales_price),
    }))

    const total_cost = rows.reduce((s, r) => s + r.total_cost, 0)
    const total_sales_price = rows.reduce((s, r) => s + r.total_sales_price, 0)
    const contribution_margin = total_sales_price - total_cost
    const margin_percentage =
      total_sales_price > 0 ? (contribution_margin / total_sales_price) * 100 : 0

    return {
      success: true,
      data: {
        rows,
        summary: {
          count: rows.length,
          total_cost: Math.round(total_cost * 100) / 100,
          total_sales_price: Math.round(total_sales_price * 100) / 100,
          contribution_margin: Math.round(contribution_margin * 100) / 100,
          margin_percentage: Math.round(margin_percentage * 100) / 100,
        },
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Create
// =====================================================

export interface CreateCaseOtherCostInput {
  case_id: string
  work_order_id?: string | null

  category: CaseOtherCostCategory
  description: string
  supplier_name?: string | null
  cost_date?: string                // YYYY-MM-DD; defaults to today (DB default)
  unit?: string                     // default 'stk'
  quantity: number
  unit_cost?: number                // default 0
  unit_sales_price?: number         // default 0

  receipt_url?: string | null
  receipt_filename?: string | null

  source?: CaseOtherCostSource      // default 'manual'
  billable?: boolean                // default true
  notes?: string | null
}

export async function createCaseOtherCost(
  input: CreateCaseOtherCostInput
): Promise<ActionResult<CaseOtherCostRow>> {
  try {
    validateUUID(input.case_id, 'case_id')
    if (input.work_order_id) validateUUID(input.work_order_id, 'work_order_id')

    if (!isCategory(input.category)) {
      return { success: false, error: 'Ugyldig kategori' }
    }

    const description = (input.description ?? '').trim()
    if (!description) return { success: false, error: 'Beskrivelse er påkrævet' }

    const quantity = Number(input.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, error: 'Antal skal være større end 0' }
    }

    const unit_cost = Number(input.unit_cost ?? 0)
    const unit_sales_price = Number(input.unit_sales_price ?? 0)
    if (!Number.isFinite(unit_cost) || unit_cost < 0) {
      return { success: false, error: 'Kostpris kan ikke være negativ' }
    }
    if (!Number.isFinite(unit_sales_price) || unit_sales_price < 0) {
      return { success: false, error: 'Salgspris kan ikke være negativ' }
    }

    if (input.cost_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.cost_date)) {
      return { success: false, error: 'Dato skal være YYYY-MM-DD' }
    }

    const { supabase, userId } = await getAuthenticatedClient()

    const { data: caseRow, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('id', input.case_id)
      .maybeSingle()
    if (caseErr || !caseRow) {
      return { success: false, error: 'Sag ikke fundet' }
    }

    const { data, error } = await supabase
      .from('case_other_costs')
      .insert({
        case_id: caseRow.id,
        work_order_id: input.work_order_id || null,
        category: input.category,
        description,
        supplier_name: input.supplier_name?.trim() || null,
        cost_date: input.cost_date || undefined,    // let DB DEFAULT take over
        unit: (input.unit ?? 'stk').trim() || 'stk',
        quantity,
        unit_cost,
        unit_sales_price,
        receipt_url: input.receipt_url?.trim() || null,
        receipt_filename: input.receipt_filename?.trim() || null,
        source: input.source ?? 'manual',
        billable: input.billable ?? true,
        notes: input.notes?.trim() || null,
        created_by: userId,
      })
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      logger.error('createCaseOtherCost failed', { error, entityId: input.case_id })
      return { success: false, error: 'Kunne ikke oprette omkostning' }
    }

    revalidatePath(`/dashboard/orders/${caseRow.id}`)
    if ((caseRow as { case_number?: string }).case_number) {
      revalidatePath(`/dashboard/orders/${(caseRow as { case_number?: string }).case_number}`)
    }

    return { success: true, data: data as CaseOtherCostRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Update — refused if billed
// =====================================================

export interface UpdateCaseOtherCostInput {
  category?: CaseOtherCostCategory
  description?: string
  supplier_name?: string | null
  cost_date?: string                // YYYY-MM-DD
  unit?: string
  quantity?: number
  unit_cost?: number
  unit_sales_price?: number
  work_order_id?: string | null
  receipt_url?: string | null
  receipt_filename?: string | null
  billable?: boolean
  notes?: string | null
}

export async function updateCaseOtherCost(
  id: string,
  patch: UpdateCaseOtherCostInput
): Promise<ActionResult<CaseOtherCostRow>> {
  try {
    validateUUID(id, 'id')
    const { supabase } = await getAuthenticatedClient()

    const { data: cur, error: readErr } = await supabase
      .from('case_other_costs')
      .select('id, case_id, invoice_line_id')
      .eq('id', id)
      .maybeSingle()
    if (readErr || !cur) {
      return { success: false, error: 'Omkostning ikke fundet' }
    }
    if (cur.invoice_line_id) {
      return { success: false, error: 'Omkostningen er faktureret og kan ikke ændres' }
    }

    const update: Record<string, unknown> = {}

    if (patch.category !== undefined) {
      if (!isCategory(patch.category)) {
        return { success: false, error: 'Ugyldig kategori' }
      }
      update.category = patch.category
    }
    if (patch.description !== undefined) {
      const t = patch.description.trim()
      if (!t) return { success: false, error: 'Beskrivelse er påkrævet' }
      update.description = t
    }
    if (patch.supplier_name !== undefined)
      update.supplier_name = patch.supplier_name?.trim() || null
    if (patch.cost_date !== undefined) {
      if (patch.cost_date && !/^\d{4}-\d{2}-\d{2}$/.test(patch.cost_date)) {
        return { success: false, error: 'Dato skal være YYYY-MM-DD' }
      }
      update.cost_date = patch.cost_date || null
    }
    if (patch.unit !== undefined) update.unit = patch.unit.trim() || 'stk'
    if (patch.quantity !== undefined) {
      const q = Number(patch.quantity)
      if (!Number.isFinite(q) || q <= 0) {
        return { success: false, error: 'Antal skal være større end 0' }
      }
      update.quantity = q
    }
    if (patch.unit_cost !== undefined) {
      const c = Number(patch.unit_cost)
      if (!Number.isFinite(c) || c < 0) {
        return { success: false, error: 'Kostpris kan ikke være negativ' }
      }
      update.unit_cost = c
    }
    if (patch.unit_sales_price !== undefined) {
      const s = Number(patch.unit_sales_price)
      if (!Number.isFinite(s) || s < 0) {
        return { success: false, error: 'Salgspris kan ikke være negativ' }
      }
      update.unit_sales_price = s
    }
    if (patch.work_order_id !== undefined) {
      if (patch.work_order_id) validateUUID(patch.work_order_id, 'work_order_id')
      update.work_order_id = patch.work_order_id || null
    }
    if (patch.receipt_url !== undefined)
      update.receipt_url = patch.receipt_url?.trim() || null
    if (patch.receipt_filename !== undefined)
      update.receipt_filename = patch.receipt_filename?.trim() || null
    if (patch.billable !== undefined) update.billable = patch.billable
    if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return { success: false, error: 'Ingen ændringer' }
    }

    const { data, error } = await supabase
      .from('case_other_costs')
      .update(update)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      logger.error('updateCaseOtherCost failed', { error, entityId: id })
      return { success: false, error: 'Kunne ikke opdatere omkostning' }
    }

    revalidatePath(`/dashboard/orders/${cur.case_id}`)
    return { success: true, data: data as CaseOtherCostRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Delete — refused if billed
// =====================================================

export async function deleteCaseOtherCost(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'id')
    const { supabase } = await getAuthenticatedClient()

    const { data: cur, error: readErr } = await supabase
      .from('case_other_costs')
      .select('id, case_id, invoice_line_id')
      .eq('id', id)
      .maybeSingle()
    if (readErr || !cur) {
      return { success: false, error: 'Omkostning ikke fundet' }
    }
    if (cur.invoice_line_id) {
      return { success: false, error: 'Omkostningen er faktureret og kan ikke slettes' }
    }

    const { error } = await supabase.from('case_other_costs').delete().eq('id', id)
    if (error) {
      logger.error('deleteCaseOtherCost failed', { error, entityId: id })
      return { success: false, error: 'Kunne ikke slette omkostning' }
    }

    revalidatePath(`/dashboard/orders/${cur.case_id}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
