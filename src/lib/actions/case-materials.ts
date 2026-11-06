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

import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { revalidatePath } from 'next/cache'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import { userCanViewCase } from '@/lib/auth/case-scope'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type {
  CaseMaterialRow,
  CaseMaterialSource,
  CaseMaterialsSummary,
} from '@/types/case-materials.types'
import { trackActionResult } from '@/lib/pilot/action-failure-log'
import { knownCost, parseCostInput } from '@/lib/cases/material-cost'
import { CASE_MATERIAL_PUBLIC_COLUMNS, listCaseMaterialsCore, readCaseMaterialCosts, withCosts } from '@/lib/materials/case-material-costs'
import type { Permission } from '@/lib/auth/permissions'

// 00248: authenticated kan ikke læse kostkolonnerne. Bruger-klienten vælger de offentlige kolonner; kost hentes bag ret.
const SELECT_COLUMNS = CASE_MATERIAL_PUBLIC_COLUMNS

/** Rækken, som brugeren må se den: kost kun med materials.view.cost_prices, ellers null. Fejl i kostlæsningen er null. */
async function withVisibleCost(row: Record<string, unknown>, hasPermission: (perm: Permission) => boolean): Promise<CaseMaterialRow> {
  const read = await readCaseMaterialCosts({ hasPermission }, [String(row.id)])
  return withCosts([row as unknown as { id: string }], read)[0] as unknown as CaseMaterialRow
}

// =====================================================
// Read
// =====================================================

export async function listCaseMaterials(
  caseId: string
): Promise<ActionResult<{ rows: CaseMaterialRow[]; summary: CaseMaterialsSummary }>> {
  try {
    validateUUID(caseId, 'case_id')
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    // Sprint 7E (scope-check) og F-8 (alle rækker) bor i kernen. 00248: kost via admin-klienten bag ret.
    const res = await listCaseMaterialsCore({
      supabase,
      hasPermission,
      canViewCase: (id) => userCanViewCase(id, { role, userId, supabase }),
    }, caseId)
    if (!res.success) logger.error('listCaseMaterials failed', { entityId: caseId, error: res.error })
    return res
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
  unit_cost?: number | null        // 00248: udeladt eller null = ukendt, ikke 0
  unit_sales_price?: number        // default 0

  source?: CaseMaterialSource      // default 'manual'
  source_offer_line_id?: string | null
  source_incoming_invoice_line_id?: string | null

  billable?: boolean               // default true
  notes?: string | null
}

/**
 * Afgør om brugerens priser GEMMES (ellers kost NULL og salg 0 — kontoret prissætter), ikke hvem der må skrive.
 * Navngivet konstant, så RLS-matrixtjekket (der læser hasPermission('…')-literaler som skrive-gates)
 * ikke tolker denne visnings-ret som en skrivevej for bogholderi. Skrive-gaten er materials.add_to_case.
 */
const PRICE_VISIBILITY_PERMISSION = 'materials.view.cost_prices' as const

/** Pilot 2026-10-30: mislykkede forsøg spores (lib/pilot/action-failure-log) — selve handlingen er createCaseMaterialImpl */
export async function createCaseMaterial(input: CreateCaseMaterialInput) {
  return trackActionResult('case_materials.create', await createCaseMaterialImpl(input), input?.case_id)
}

async function createCaseMaterialImpl(
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

    const parsedCost = parseCostInput(input.unit_cost)
    const unit_sales_price = Number(input.unit_sales_price ?? 0)
    if (!parsedCost.ok) {
      return { success: false, error: 'Kostpris kan ikke være negativ' }
    }
    if (!Number.isFinite(unit_sales_price) || unit_sales_price < 0) {
      return { success: false, error: 'Salgspris kan ikke være negativ' }
    }

    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('materials.add_to_case')) {
      return { success: false, error: 'Manglende tilladelse: materials.add_to_case' }
    }

    // Sprint 7E — montor maa kun tilfoeje materialer paa egne sager.
    if (!(await userCanViewCase(input.case_id, { role, userId, supabase }))) {
      return { success: false, error: 'Sagen er ikke tildelt dig' }
    }

    // Verify the case exists (avoid creating an orphan row from a stale UI)
    const { data: caseRow, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, case_number, status')
      .eq('id', input.case_id)
      .maybeSingle()
    if (caseErr || !caseRow) {
      return { success: false, error: 'Sag ikke fundet' }
    }
    // Sags-review 2026-10-09 (#6): intet nyt arbejde på en lukket sag (det blev aldrig faktureret og gav ingen advarsel)
    if ((caseRow as { status?: string }).status === 'closed') return { success: false, error: 'Sagen er lukket — genåbn den først' }
    // IDOR-sweep 2026-10-09 (#8): arbejdsordren skal høre til sagen (ellers forvrænges en anden sags ordre-totaler)
    if (input.work_order_id) {
      const { data: wo } = await supabase.from('work_orders').select('case_id').eq('id', input.work_order_id).maybeSingle()
      if (!wo || (wo as { case_id: string | null }).case_id !== input.case_id) {
        return { success: false, error: 'Arbejdsordren hører ikke til sagen' }
      }
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
        // Uden kost-ret (montør) prissætter kontoret — klientens priser ignoreres. 00248: kosten er ukendt, ikke 0.
        unit_cost: hasPermission(PRICE_VISIBILITY_PERMISSION) ? parsedCost.cost : null,
        unit_sales_price: hasPermission(PRICE_VISIBILITY_PERMISSION) ? unit_sales_price : 0,
        // SC-13 (sags-review 2026-10-17): kilde og kildelinks kun fra kontoret (materials.edit) — ellers kunne montøren
        // forfalske tilbudt-vs-faktisk og LF-5-undtagelsen for negativ kost
        source: hasPermission('materials.edit') ? (input.source ?? 'manual') : 'manual',
        source_offer_line_id: hasPermission('materials.edit') ? (input.source_offer_line_id || null) : null,
        source_incoming_invoice_line_id: hasPermission('materials.edit') ? (input.source_incoming_invoice_line_id || null) : null,
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

    return { success: true, data: await withVisibleCost(data as unknown as Record<string, unknown>, hasPermission) }
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
  /** 00248: null = sæt kosten til ukendt. Udeladt = uændret. */
  unit_cost?: number | null
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
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('materials.edit')) {
      return { success: false, error: 'Manglende tilladelse: materials.edit' }
    }

    // Read current to enforce billed-lock and to know the case_id for revalidate. 00248: rækken læses med brugerens klient
    // (bevis for synlighed); kosten til revisionssporet hentes bag kost-retten.
    const { data: curRow, error: readErr } = await supabase
      .from('case_materials')
      .select('id, case_id, invoice_line_id, description, quantity, unit_sales_price, source')
      .eq('id', id)
      .maybeSingle()
    if (readErr || !curRow) {
      return { success: false, error: 'Materiale ikke fundet' }
    }
    const curCost = await readCaseMaterialCosts({ hasPermission }, [id])
    if (curCost.state === 'error') return { success: false, error: 'Kunne ikke læse materialets kost' }
    const cur = { ...curRow, unit_cost: curCost.state === 'ok' ? curCost.byId.get(id)?.unit_cost ?? null : null }
    if (cur.invoice_line_id) {
      return {
        success: false,
        error: 'Materialet er faktureret og kan ikke ændres',
      }
    }
    const guards = await import('@/lib/cases/cost-row-guards')
    if (await guards.caseIsClosed(supabase, cur.case_id)) return { success: false, error: 'Sagen er lukket — genåbn den først' } // SC-9
    if (patch.work_order_id && !(await guards.workOrderBelongsToCase(supabase, patch.work_order_id, cur.case_id))) {
      return { success: false, error: 'Arbejdsordren hører ikke til sagen' } // SC-5
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
    // 00248: uden kost-ret ser brugeren null i stedet for kosten. Priserne ignoreres (som ved oprettelse), ellers ville
    // en gemt formular overskrive en kendt kost med ukendt.
    const canSetPrices = hasPermission(PRICE_VISIBILITY_PERMISSION)
    if (canSetPrices && patch.unit_cost !== undefined) {
      // LF-5 (indkøbs-review 2026-10-16): returlinjer fra en leverandør-kreditnota bærer negativ kost (fratrækkes sagens
      // kost) — de skal kunne redigeres (fx tilføje salgspris) uden at kosten tvinges positiv. Øvrige: ≥ 0.
      const negativeAllowed = (cur as { source?: string | null }).source === 'supplier_invoice'
      const c = parseCostInput(patch.unit_cost, { allowNegative: negativeAllowed })
      if (!c.ok) {
        return { success: false, error: 'Kostpris kan ikke være negativ' }
      }
      update.unit_cost = c.cost
    }
    if (canSetPrices && patch.unit_sales_price !== undefined) {
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
      .is('invoice_line_id', null) // SC-6: faktureret imens -> ingen ændring
      .select(SELECT_COLUMNS)
      .maybeSingle()

    if (error || !data) {
      logger.error('updateCaseMaterial failed', { error, entityId: id })
      return { success: false, error: error ? 'Kunne ikke opdatere materiale' : 'Materialet blev ikke ændret (faktureret imens eller ingen adgang)' }
    }

    // Sprint Ø2.12 — audit pris-/antal-ændringer på materialesnapshot (fra/til).
    const econChanged =
      (update.quantity !== undefined && Number(update.quantity) !== Number(cur.quantity)) ||
      // 00248: ukendt → 0 og 0 → ukendt er en ændring (Number(null) === 0 ville skjule den for revisionssporet)
      (update.unit_cost !== undefined && knownCost(update.unit_cost) !== knownCost(cur.unit_cost)) ||
      (update.unit_sales_price !== undefined && Number(update.unit_sales_price) !== Number(cur.unit_sales_price))
    if (econChanged) {
      try {
        await insertAuditRow({
          user_id: userId,
          entity_type: 'case_material',
          entity_id: id,
          entity_name: cur.description as string,
          action: 'material_snapshot_changed',
          action_description: `Materialesnapshot ændret: "${cur.description}"`,
          changes: {
            quantity: { from: cur.quantity, to: update.quantity ?? cur.quantity },
            // 00248: uden kost-ret kendes kosten ikke her (skjult = null) og kan ikke ændres — et "null → null" ville være
            // et falsk spor, og aktøren kan læse sin egen revisionsrække. Kun med retten skrives kosten i sporet.
            ...(canSetPrices
              ? { unit_cost: { from: cur.unit_cost, to: update.unit_cost === undefined ? cur.unit_cost : update.unit_cost } }
              : {}),
            unit_sales_price: { from: cur.unit_sales_price, to: update.unit_sales_price ?? cur.unit_sales_price },
          },
          metadata: { case_id: cur.case_id },
        })
      } catch (e) {
        logger.error('audit material_snapshot_changed failed', { error: e })
      }
    }

    revalidatePath(`/dashboard/orders/${cur.case_id}`)
    return { success: true, data: await withVisibleCost(data as unknown as Record<string, unknown>, hasPermission) }
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
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('materials.delete')) {
      return { success: false, error: 'Manglende tilladelse: materials.delete' }
    }

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
    const guards = await import('@/lib/cases/cost-row-guards')
    if (await guards.caseIsClosed(supabase, cur.case_id)) return { success: false, error: 'Sagen er lukket — genåbn den først' } // SC-9
    const supplierLines = await guards.findConvertedSupplierLines('material', id) // SC-1

    const { data: gone, error } = await supabase.from('case_materials').delete().eq('id', id).is('invoice_line_id', null).select('id')
    if (error) {
      logger.error('deleteCaseMaterial failed', { error, entityId: id })
      return { success: false, error: 'Kunne ikke slette materiale' }
    }
    // SC-6: 0 rækker = faktureret imens eller RLS-afvist (før meldt som slettet)
    if (!gone || gone.length === 0) return { success: false, error: 'Materialet blev ikke slettet (faktureret imens eller ingen adgang)' }
    await guards.releaseSupplierLines(supplierLines)

    revalidatePath(`/dashboard/orders/${cur.case_id}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
