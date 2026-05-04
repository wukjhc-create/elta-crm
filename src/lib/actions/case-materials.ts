'use server'

/**
 * Sprint 5B — case_materials server actions.
 *
 * Canonical material consumption on a service_case (sag). Snapshot
 * pricing — once a row is created, unit_cost / unit_sales_price are
 * frozen. Catalog price changes do NOT flow back into history.
 *
 * Delete is gated by invoice_line_id (cannot delete a billed row).
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type {
  CaseMaterialRow,
  CaseMaterialSource,
  CaseMaterialsSummary,
} from '@/types/case-materials.types'

const SELECT_COLUMNS = `
  id, case_id, work_order_id, supplier_product_id, material_id,
  description, sku_snapshot, supplier_name_snapshot, unit,
  quantity, unit_cost, unit_sales_price,
  total_cost, total_sales_price,
  source, source_offer_line_id, source_incoming_invoice_line_id,
  billable, invoice_line_id,
  notes, created_by, created_at, updated_at
`

// =====================================================
// Read
// =====================================================

export async function listCaseMaterials(
  caseId: string
): Promise<ActionResult<{ rows: CaseMaterialRow[]; summary: CaseMaterialsSummary }>> {
  try {
    validateUUID(caseId, 'case_id')
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('case_materials')
      .select(SELECT_COLUMNS)
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })
      .limit(500)

    if (error) {
      logger.error('listCaseMaterials failed', { error, entityId: caseId })
      return { success: false, error: 'Kunne ikke hente materialer' }
    }

    const rows = ((data ?? []) as CaseMaterialRow[]).map((r) => ({
      ...r,
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

export interface CreateCaseMaterialInput {
  case_id: string
  work_order_id?: string | null
  supplier_product_id?: string | null
  material_id?: string | null

  description: string
  sku_snapshot?: string | null
  supplier_name_snapshot?: string | null
  unit?: string                    // default 'stk'
  quantity: number
  unit_cost?: number               // default 0
  unit_sales_price?: number        // default 0

  source?: CaseMaterialSource      // default 'manual'
  source_offer_line_id?: string | null
  source_incoming_invoice_line_id?: string | null

  billable?: boolean               // default true
  notes?: string | null
}

export async function createCaseMaterial(
  input: CreateCaseMaterialInput
): Promise<ActionResult<CaseMaterialRow>> {
  try {
    validateUUID(input.case_id, 'case_id')
    if (input.work_order_id) validateUUID(input.work_order_id, 'work_order_id')
    if (input.supplier_product_id)
      validateUUID(input.supplier_product_id, 'supplier_product_id')
    if (input.material_id) validateUUID(input.material_id, 'material_id')

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

    const { supabase, userId } = await getAuthenticatedClient()

    // Verify the case exists (avoid creating an orphan row from a stale UI)
    const { data: caseRow, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('id', input.case_id)
      .maybeSingle()
    if (caseErr || !caseRow) {
      return { success: false, error: 'Sag ikke fundet' }
    }

    const { data, error } = await supabase
      .from('case_materials')
      .insert({
        case_id: caseRow.id,
        work_order_id: input.work_order_id || null,
        supplier_product_id: input.supplier_product_id || null,
        material_id: input.material_id || null,
        description,
        sku_snapshot: input.sku_snapshot?.trim() || null,
        supplier_name_snapshot: input.supplier_name_snapshot?.trim() || null,
        unit: (input.unit ?? 'stk').trim() || 'stk',
        quantity,
        unit_cost,
        unit_sales_price,
        source: input.source ?? 'manual',
        source_offer_line_id: input.source_offer_line_id || null,
        source_incoming_invoice_line_id: input.source_incoming_invoice_line_id || null,
        billable: input.billable ?? true,
        notes: input.notes?.trim() || null,
        created_by: userId,
      })
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      logger.error('createCaseMaterial failed', { error, entityId: input.case_id })
      return { success: false, error: 'Kunne ikke oprette materiale' }
    }

    revalidatePath(`/dashboard/orders/${caseRow.id}`)
    if ((caseRow as { case_number?: string }).case_number) {
      revalidatePath(`/dashboard/orders/${(caseRow as { case_number?: string }).case_number}`)
    }

    return { success: true, data: data as CaseMaterialRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Update — only allowed while not billed
// =====================================================

export interface UpdateCaseMaterialInput {
  description?: string
  sku_snapshot?: string | null
  supplier_name_snapshot?: string | null
  unit?: string
  quantity?: number
  unit_cost?: number
  unit_sales_price?: number
  work_order_id?: string | null
  billable?: boolean
  notes?: string | null
}

export async function updateCaseMaterial(
  id: string,
  patch: UpdateCaseMaterialInput
): Promise<ActionResult<CaseMaterialRow>> {
  try {
    validateUUID(id, 'id')
    const { supabase } = await getAuthenticatedClient()

    // Read current to enforce billed-lock and to know the case_id for revalidate
    const { data: cur, error: readErr } = await supabase
      .from('case_materials')
      .select('id, case_id, invoice_line_id')
      .eq('id', id)
      .maybeSingle()
    if (readErr || !cur) {
      return { success: false, error: 'Materiale ikke fundet' }
    }
    if (cur.invoice_line_id) {
      return {
        success: false,
        error: 'Materialet er faktureret og kan ikke ændres',
      }
    }

    const update: Record<string, unknown> = {}
    if (patch.description !== undefined) {
      const t = patch.description.trim()
      if (!t) return { success: false, error: 'Beskrivelse er påkrævet' }
      update.description = t
    }
    if (patch.sku_snapshot !== undefined)
      update.sku_snapshot = patch.sku_snapshot?.trim() || null
    if (patch.supplier_name_snapshot !== undefined)
      update.supplier_name_snapshot = patch.supplier_name_snapshot?.trim() || null
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
    if (patch.billable !== undefined) update.billable = patch.billable
    if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return { success: false, error: 'Ingen ændringer' }
    }

    const { data, error } = await supabase
      .from('case_materials')
      .update(update)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      logger.error('updateCaseMaterial failed', { error, entityId: id })
      return { success: false, error: 'Kunne ikke opdatere materiale' }
    }

    revalidatePath(`/dashboard/orders/${cur.case_id}`)
    return { success: true, data: data as CaseMaterialRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Delete — only allowed while not billed
// =====================================================

export async function deleteCaseMaterial(id: string): Promise<ActionResult> {
  try {
    validateUUID(id, 'id')
    const { supabase } = await getAuthenticatedClient()

    const { data: cur, error: readErr } = await supabase
      .from('case_materials')
      .select('id, case_id, invoice_line_id')
      .eq('id', id)
      .maybeSingle()
    if (readErr || !cur) {
      return { success: false, error: 'Materiale ikke fundet' }
    }
    if (cur.invoice_line_id) {
      return {
        success: false,
        error: 'Materialet er faktureret og kan ikke slettes',
      }
    }

    const { error } = await supabase.from('case_materials').delete().eq('id', id)
    if (error) {
      logger.error('deleteCaseMaterial failed', { error, entityId: id })
      return { success: false, error: 'Kunne ikke slette materiale' }
    }

    revalidatePath(`/dashboard/orders/${cur.case_id}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
