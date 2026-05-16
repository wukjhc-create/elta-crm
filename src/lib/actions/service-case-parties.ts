'use server'

/**
 * Sprint 9E Phase 3 — server action til at redigere sagspartner-felter.
 *
 * Manuelt set-flow: brugeren vælger explicit ordregiver/end_customer/
 * payer/purchased_from + billing_mode. Mail-router er IKKE påvirket
 * af dette — Phase 6 introducerer routing-skiftet.
 *
 * MÅ IKKE ændre service_cases.customer_id, site_customer_id, eller
 * site_contact_id — dem ejer EditSiteInfoDialog (Sprint 8G).
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import {
  type ServiceCase,
  type ServiceCaseBillingMode,
} from '@/types/service-cases.types'

const VALID_BILLING_MODES: ReadonlySet<ServiceCaseBillingMode> = new Set<ServiceCaseBillingMode>([
  'same_as_customer',
  'orderer_pays',
  'end_customer_pays',
  'third_party_pays',
  'unknown',
])

export interface UpdateServiceCasePartiesInput {
  orderer_customer_id?: string | null
  end_customer_id?: string | null
  payer_customer_id?: string | null
  purchased_from_customer_id?: string | null
  purchase_source?: string | null
  billing_mode?: ServiceCaseBillingMode | null
}

function normalizeId(value: string | null | undefined): string | null {
  if (value === undefined) return null
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined) return null
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function updateServiceCaseParties(
  caseId: string,
  input: UpdateServiceCasePartiesInput
): Promise<{ success: boolean; error?: string; data?: ServiceCase }> {
  try {
    validateUUID(caseId, 'caseId')

    const { supabase, hasPermission, userId } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }

    // Bekraft at sagen findes (saa vi giver pent-fejl frem for FK-fejl)
    const { data: existing, error: fetchErr } = await supabase
      .from('service_cases')
      .select('id, customer_id')
      .eq('id', caseId)
      .maybeSingle()
    if (fetchErr || !existing) {
      return { success: false, error: 'Sagen blev ikke fundet' }
    }

    // Normalize + validate alle FK-felter
    const ordererId = normalizeId(input.orderer_customer_id)
    const endCustomerId = normalizeId(input.end_customer_id)
    const payerId = normalizeId(input.payer_customer_id)
    const purchasedFromId = normalizeId(input.purchased_from_customer_id)
    let purchaseSource = normalizeText(input.purchase_source)

    const fkFields: Array<{ name: string; id: string | null }> = [
      { name: 'orderer_customer_id', id: ordererId },
      { name: 'end_customer_id', id: endCustomerId },
      { name: 'payer_customer_id', id: payerId },
      { name: 'purchased_from_customer_id', id: purchasedFromId },
    ]

    for (const f of fkFields) {
      if (f.id) {
        try {
          validateUUID(f.id, f.name)
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : `Ugyldigt ${f.name}` }
        }
        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .eq('id', f.id)
          .maybeSingle()
        if (!cust) {
          return { success: false, error: `Kunde til ${f.name} blev ikke fundet` }
        }
      }
    }

    // Hvis purchased_from peger paa en kunde, nulstil fritekst saa vi
    // ikke har redundant data. Caller kan stadig saette begge ved at
    // sende purchase_source eksplicit.
    if (purchasedFromId && input.purchase_source === undefined) {
      purchaseSource = null
    }

    // billing_mode validation
    let billingMode: ServiceCaseBillingMode | null | undefined = undefined
    if (input.billing_mode !== undefined) {
      if (input.billing_mode === null) {
        billingMode = null
      } else if (VALID_BILLING_MODES.has(input.billing_mode)) {
        billingMode = input.billing_mode
      } else {
        return { success: false, error: `Ugyldig billing_mode: ${input.billing_mode}` }
      }
    }

    // Byg payload — kun felter caller eksplicit har sat
    const payload: Record<string, unknown> = {}
    if (input.orderer_customer_id !== undefined) payload.orderer_customer_id = ordererId
    if (input.end_customer_id !== undefined) payload.end_customer_id = endCustomerId
    if (input.payer_customer_id !== undefined) payload.payer_customer_id = payerId
    if (input.purchased_from_customer_id !== undefined) {
      payload.purchased_from_customer_id = purchasedFromId
      // Naar customer-felt aendres, opdater fritekst (mulig nulstilling ovenfor)
      if (input.purchase_source === undefined) {
        payload.purchase_source = purchaseSource
      }
    }
    if (input.purchase_source !== undefined) payload.purchase_source = purchaseSource
    if (billingMode !== undefined) payload.billing_mode = billingMode

    if (Object.keys(payload).length === 0) {
      return { success: true, data: existing as unknown as ServiceCase }
    }

    const { data, error } = await supabase
      .from('service_cases')
      .update(payload)
      .eq('id', caseId)
      .select('*')
      .single()

    if (error) {
      logger.error('updateServiceCaseParties failed', {
        error,
        userId,
        entityId: caseId,
      })
      return { success: false, error: 'Kunne ikke opdatere sagspartnere' }
    }

    logger.info('Service case parties updated', {
      userId,
      action: 'updateServiceCaseParties',
      entity: 'service_cases',
      entityId: caseId,
      metadata: {
        orderer_customer_id: ordererId,
        end_customer_id: endCustomerId,
        payer_customer_id: payerId,
        purchased_from_customer_id: purchasedFromId,
        purchase_source: purchaseSource,
        billing_mode: billingMode,
      },
    })

    revalidatePath(`/dashboard/orders/${caseId}`)
    revalidatePath('/dashboard/orders')
    revalidatePath('/dashboard/service-cases')

    return { success: true, data: data as ServiceCase }
  } catch (err) {
    logger.error('updateServiceCaseParties threw', {
      error: err instanceof Error ? err : new Error(String(err)),
      entityId: caseId,
    })
    return { success: false, error: err instanceof Error ? err.message : 'Uventet fejl' }
  }
}
