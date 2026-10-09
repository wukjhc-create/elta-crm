'use server'

import { randomUUID } from 'crypto'
import { getAuthenticatedClient, formatError, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * RBAC app-lag (P-006, runde 3): modul-paritet — skrivende actions kraever samme rettighed som modulets side.
 */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}

/**
 * IDOR-sweep 2026-10-09 (#3): skrivning kræver kunderelationen (customers.edit) — ellers kun på en sag i brugerens scope
 * (montør: egne sager) der hører til kunden. Før var læse-retten (customers.view) nok til at overskrive/slette enhver
 * kundes tagtegning. Returnerer fejltekst eller null.
 */
async function roofWriteDenied(
  ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>,
  customerId: string | null,
  serviceCaseId: string | null,
): Promise<string | null> {
  if (serviceCaseId) {
    const { data: sc } = await ctx.supabase.from('service_cases').select('customer_id').eq('id', serviceCaseId).maybeSingle()
    if (!sc) return 'Sagen blev ikke fundet'
    if (customerId && (sc as { customer_id: string | null }).customer_id !== customerId) return 'Sagen tilhører ikke kunden'
  }
  if (ctx.hasPermission('customers.edit')) return null
  if (!serviceCaseId) return 'Manglende tilladelse: customers.edit'
  const { userCanViewCase } = await import('@/lib/auth/case-scope')
  return (await userCanViewCase(serviceCaseId, ctx)) ? null : 'Du har ikke adgang til denne sag'
}
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type {
  RoofDrawing,
  RoofDrawingWithUrl,
  CreateRoofDrawingInput,
  ListRoofDrawingsInput,
  SaveRoofDrawingInput,
} from '@/types/roof-drawings.types'
import { emptyRoofDrawingData } from '@/types/roof-drawings.types'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Storage-review 2026-10-08 (S1): fil-adgang går via service-klienten bag action-gaten — så bucket-politikkerne kan
 * låses for direkte REST-adgang (authenticated kunne læse/overskrive alle filer i 'attachments').
 */
function storageClient() {
  return createAdminClient()
}

const BUCKET = 'service-case-files'

/** Bær en frisk signed URL ind på rækken, så browseren kan vise billedet. */
async function withSignedUrl(row: RoofDrawing): Promise<RoofDrawingWithUrl> {
  const image_url = row.image_storage_path
    ? await getStorageSignedUrlOrNull(BUCKET, row.image_storage_path, SIGNED_URL_TTL.SHORT)
    : null
  return { ...row, image_url }
}

/**
 * Opret en ny tagtegning: upload det komprimerede billede til
 * service-case-files og indsæt rækken med tom geometri.
 */
export async function createRoofDrawing(
  input: CreateRoofDrawingInput,
): Promise<ActionResult<RoofDrawingWithUrl>> {
  try {
    const ctx = await requireGate('customers.view')
    const { supabase, userId } = ctx

    validateUUID(input.customerId, 'kunde-ID')
    if (input.serviceCaseId) validateUUID(input.serviceCaseId, 'sags-ID')
    {
      const denied = await roofWriteDenied(ctx, input.customerId, input.serviceCaseId ?? null)
      if (denied) return { success: false, error: denied }
    }

    if (!input.imageBase64 || !input.imageBase64.startsWith('data:')) {
      return { success: false, error: 'Ugyldigt billede' }
    }
    if (!input.imageWidth || !input.imageHeight) {
      return { success: false, error: 'Manglende billed-dimensioner' }
    }

    // Decode data-URI til buffer
    const mimeType = input.imageBase64.split(';')[0].split(':')[1] || 'image/jpeg'
    const base64Data = input.imageBase64.split(',')[1] || ''
    const buffer = Buffer.from(base64Data, 'base64')

    const ext = mimeType.includes('png') ? 'png' : 'jpg'
    const storagePath = `roof-drawings/${input.customerId}/${randomUUID()}.${ext}`

    const { error: uploadErr } = await storageClient().storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

    if (uploadErr) {
      logger.error('createRoofDrawing upload failed', { error: uploadErr })
      return { success: false, error: 'Kunne ikke uploade billede' }
    }

    const { data, error } = await supabase
      .from('roof_drawings')
      .insert({
        customer_id: input.customerId,
        service_case_id: input.serviceCaseId ?? null,
        title: input.title?.trim() || 'Tagflade',
        image_storage_path: storagePath,
        image_width: Math.round(input.imageWidth),
        image_height: Math.round(input.imageHeight),
        panel_product_code: input.panelProductCode ?? null,
        panel_count: 0,
        drawing_data: emptyRoofDrawingData(input.panelWidthMm, input.panelHeightMm),
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !data) {
      logger.error('createRoofDrawing insert failed', { error })
      return { success: false, error: 'Kunne ikke gemme tegning' }
    }

    return { success: true, data: await withSignedUrl(data as RoofDrawing) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tegning') }
  }
}

/**
 * Hent tagtegninger for en sag (foretrukket) eller en kunde, med friske
 * signed URLs. Mindst ét af serviceCaseId/customerId skal være sat.
 */
export async function listRoofDrawings(
  input: ListRoofDrawingsInput,
): Promise<ActionResult<RoofDrawingWithUrl[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    if (!input.serviceCaseId && !input.customerId) {
      return { success: false, error: 'Mangler sag eller kunde' }
    }

    let query = supabase.from('roof_drawings').select('*')
    if (input.serviceCaseId) {
      validateUUID(input.serviceCaseId, 'sags-ID')
      query = query.eq('service_case_id', input.serviceCaseId)
    } else if (input.customerId) {
      validateUUID(input.customerId, 'kunde-ID')
      query = query.eq('customer_id', input.customerId)
    }

    const { data, error } = await query.order('created_at', { ascending: true })

    if (error) {
      logger.error('listRoofDrawings failed', { error })
      return { success: false, error: 'Kunne ikke hente tegninger' }
    }

    const rows = (data || []) as RoofDrawing[]
    const enriched = await Promise.all(rows.map(withSignedUrl))
    return { success: true, data: enriched }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tegninger') }
  }
}

/** Gem geometri (målestok + paneler) + denormaliseret panelantal. */
export async function saveRoofDrawing(
  input: SaveRoofDrawingInput,
): Promise<ActionResult<RoofDrawing>> {
  try {
    const ctx = await requireGate('customers.view')
    const { supabase } = ctx
    validateUUID(input.id, 'tegnings-ID')
    {
      const { data: cur } = await supabase.from('roof_drawings').select('customer_id, service_case_id').eq('id', input.id).maybeSingle()
      if (!cur) return { success: false, error: 'Tegningen blev ikke fundet' }
      const c = cur as { customer_id: string | null; service_case_id: string | null }
      const denied = await roofWriteDenied(ctx, c.customer_id, c.service_case_id)
      if (denied) return { success: false, error: denied }
    }

    const patch: Record<string, unknown> = {
      panel_count: Math.max(0, Math.round(input.panelCount)),
      drawing_data: input.drawingData,
    }
    if (input.title !== undefined) patch.title = input.title.trim() || 'Tagflade'
    if (input.panelProductCode !== undefined) patch.panel_product_code = input.panelProductCode

    const { data, error } = await supabase
      .from('roof_drawings')
      .update(patch)
      .eq('id', input.id)
      .select('*')
      .single()

    if (error || !data) {
      logger.error('saveRoofDrawing failed', { error })
      return { success: false, error: 'Kunne ikke gemme tegning' }
    }

    return { success: true, data: data as RoofDrawing }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme tegning') }
  }
}

/** Slet en tagtegning. Billedet i storage ryddes ikke (kan gøres senere). */
export async function deleteRoofDrawing(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireGate('customers.view')
    const { supabase } = ctx
    validateUUID(id, 'tegnings-ID')
    {
      const { data: cur } = await supabase.from('roof_drawings').select('customer_id, service_case_id').eq('id', id).maybeSingle()
      if (!cur) return { success: false, error: 'Tegningen blev ikke fundet' }
      const c = cur as { customer_id: string | null; service_case_id: string | null }
      const denied = await roofWriteDenied(ctx, c.customer_id, c.service_case_id)
      if (denied) return { success: false, error: denied }
    }

    const { error } = await supabase.from('roof_drawings').delete().eq('id', id)
    if (error) {
      logger.error('deleteRoofDrawing failed', { error })
      return { success: false, error: 'Kunne ikke slette tegning' }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette tegning') }
  }
}
