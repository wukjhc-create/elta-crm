'use server'

/**
 * N26c — efterkalkulation på linjeniveau for én sag: tilbuddets linjer (service_cases.source_offer_id) mod sagens
 * faktiske materialer (case_materials) og timer (time_logs via work_orders). Kun læsning; matching i
 * src/lib/cases/offer-vs-actual.ts. Kost → economy.cost_prices. Timekost kun aggregeret (D50).
 */

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import { compareOfferToActual, type OfferVsActualResult } from '@/lib/cases/offer-vs-actual'
import type { ActionResult } from '@/types/common.types'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CaseOfferVsActual extends OfferVsActualResult {
  offer: { id: string; offer_number: string | null } | null
}

export async function getCaseOfferVsActual(caseId: string): Promise<ActionResult<CaseOfferVsActual>> {
  try {
    validateUUID(caseId, 'sag ID')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.cost_prices')) {
      return { success: false, error: 'Manglende tilladelse: economy.cost_prices' }
    }

    const { data: sag, error: caseErr } = await supabase.from('service_cases').select('id, source_offer_id').eq('id', caseId).maybeSingle()
    if (caseErr) {
      logger.error('getCaseOfferVsActual: case failed', { error: caseErr })
      return { success: false, error: 'Kunne ikke hente sagen' }
    }
    if (!sag) return { success: false, error: 'Sag ikke fundet' }
    const offerId = (sag.source_offer_id as string | null) ?? null

    const { data: wos, error: woErr } = await supabase.from('work_orders').select('id').eq('case_id', caseId)
    if (woErr) {
      logger.error('getCaseOfferVsActual: work_orders failed', { error: woErr })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer' }
    }
    const woIds = (wos ?? []).map((w) => w.id as string)

    const [offerRes, linesRes, materialsRes, logsRes] = await Promise.all([
      offerId ? supabase.from('offers').select('id, offer_number').eq('id', offerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      offerId
        // 00192: kostkolonner — admin-klient bag economy.cost_prices
        ? createAdminClient().from('offer_line_items')
            .select('id, description, quantity, unit, cost_price, supplier_cost_price_at_creation, supplier_product_id, position')
            .eq('offer_id', offerId).order('position')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('case_materials')
        .select('id, description, quantity, unit, total_cost, supplier_product_id, source_offer_line_id, created_at')
        .eq('case_id', caseId).order('created_at'),
      woIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : // 00192: kostkolonner læses med admin-klienten bag gaten ovenfor (bruger-klienten kan ikke læse dem)
          createAdminClient().from('time_logs').select('hours, cost_amount').in('work_order_id', woIds),
    ])
    for (const [name, res] of [['offer', offerRes], ['offer_line_items', linesRes], ['case_materials', materialsRes], ['time_logs', logsRes]] as const) {
      if (res.error) {
        logger.error(`getCaseOfferVsActual: ${name} failed`, { error: res.error })
        return { success: false, error: 'Kunne ikke hente efterkalkulation' }
      }
    }

    const logs = (logsRes.data ?? []) as Array<{ hours: number | string | null; cost_amount: number | string | null }>
    const hasCost = logs.some((l) => l.cost_amount != null)
    const result = compareOfferToActual(
      (linesRes.data ?? []) as Parameters<typeof compareOfferToActual>[0],
      (materialsRes.data ?? []) as Parameters<typeof compareOfferToActual>[1],
      {
        hours: logs.reduce((s, l) => s + (Number(l.hours ?? 0) || 0), 0),
        cost: hasCost ? logs.reduce((s, l) => s + (Number(l.cost_amount ?? 0) || 0), 0) : null,
      },
    )
    const offer = offerRes.data as { id: string; offer_number: string | null } | null
    return { success: true, data: { ...result, offer: offer ? { id: offer.id, offer_number: offer.offer_number } : null } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke hente efterkalkulation') }
  }
}
