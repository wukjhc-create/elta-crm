'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { createAuditLog } from '@/lib/actions/audit'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

// =====================================================
// Sprint 3B — Manual "Opret sag fra tilbud" flow.
//
// Idempotent: if a service_case already exists with source_offer_id =
// offerId, returns the existing case_number rather than creating a new
// one. Does NOT touch the legacy projects auto-create path in
// portal.acceptOffer.
// =====================================================

export interface OfferToCaseResult {
  case_number: string
  case_id: string
  /** True when this call created a new sag; false when an existing
   *  one was returned (idempotency). */
  created: boolean
}

/**
 * Look up a service_case linked to a given offer (via source_offer_id).
 * Returns null when no link exists. Used by offer detail UI to decide
 * between "Opret sag fra tilbud" and "Åbn sag".
 */
export async function getServiceCaseFromOffer(
  offerId: string
): Promise<ActionResult<{ case_number: string; case_id: string } | null>> {
  try {
    if (!offerId) return { success: false, error: 'offerId mangler' }
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('source_offer_id', offerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('getServiceCaseFromOffer failed', { error })
      return { success: false, error: 'Kunne ikke slå sag op' }
    }

    if (!data) return { success: true, data: null }
    return {
      success: true,
      data: {
        case_id: data.id as string,
        case_number: data.case_number as string,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

/**
 * Create a service_case from an offer. Idempotent — re-calling for the
 * same offer returns the existing sag.
 *
 * Field mapping (copy-on-create — no live sync):
 *   service_cases.source_offer_id ← offer.id
 *   service_cases.customer_id     ← offer.customer_id
 *   service_cases.title           ← offer.title
 *   service_cases.project_name    ← offer.title
 *   service_cases.contract_sum    ← offer.final_amount
 *   service_cases.description     ← offer.description ?? offer.scope
 *   service_cases.reference       ← offer.offer_number
 *   service_cases.type            ← 'installation' (Sprint 3B default)
 *   service_cases.status          ← 'new'
 *   service_cases.source          ← 'manual'
 */
export async function createServiceCaseFromOffer(
  offerId: string
): Promise<ActionResult<OfferToCaseResult>> {
  try {
    if (!offerId) return { success: false, error: 'offerId mangler' }
    const { supabase, userId } = await getAuthenticatedClient()

    // 1. Idempotency check — reuse existing sag.
    {
      const { data: existing } = await supabase
        .from('service_cases')
        .select('id, case_number')
        .eq('source_offer_id', offerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing) {
        return {
          success: true,
          data: {
            case_id: existing.id as string,
            case_number: existing.case_number as string,
            created: false,
          },
        }
      }
    }

    // 2. Load the offer.
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, offer_number, title, description, scope, status, customer_id, final_amount')
      .eq('id', offerId)
      .maybeSingle()
    if (offerErr || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // 3. Insert the sag.
    const description =
      (typeof offer.description === 'string' && offer.description.trim()) ||
      (typeof offer.scope === 'string' && offer.scope.trim()) ||
      null

    const insertPayload = {
      source_offer_id: offer.id as string,
      customer_id: (offer.customer_id as string | null) ?? null,
      title: (offer.title as string) || 'Sag fra tilbud',
      project_name: (offer.title as string) || null,
      contract_sum: (offer.final_amount as number | null) ?? null,
      description,
      reference: (offer.offer_number as string | null) ?? null,
      type: 'installation' as const,
      status: 'new' as const,
      priority: 'medium' as const,
      source: 'manual' as const,
      created_by: userId,
      assigned_to: userId,
    }

    const { data: sag, error: insertErr } = await supabase
      .from('service_cases')
      .insert(insertPayload)
      .select('id, case_number')
      .single()

    if (insertErr || !sag) {
      logger.error('createServiceCaseFromOffer insert failed', { error: insertErr })
      return { success: false, error: 'Kunne ikke oprette sag' }
    }

    // 4. Audit log (best-effort — never blocks).
    try {
      await createAuditLog({
        entity_type: 'service_case',
        entity_id: sag.id as string,
        entity_name: (sag.case_number as string) ?? (sag.id as string),
        action: 'create',
        action_description: `Oprettet fra tilbud ${offer.offer_number ?? offer.id}`,
      })
    } catch {
      /* best-effort */
    }

    // 5. Revalidate touched paths.
    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${sag.id}`)
    revalidatePath(`/dashboard/orders/${sag.case_number}`)
    revalidatePath(`/dashboard/offers/${offerId}`)

    return {
      success: true,
      data: {
        case_id: sag.id as string,
        case_number: sag.case_number as string,
        created: true,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
