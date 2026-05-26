'use server'

/**
 * Sprint 12A Trin 5A — Offer parties read-only loader.
 *
 * Loads the related customer rows for orderer / end / payer roles on
 * an offer, plus the billing_mode. Returns null for any role that is
 * identical to the offer's primary customer_id (so the UI can collapse
 * the common "same as customer" case).
 *
 * Read-only. No mutation, no mail-routing impact. Edit dialog comes
 * in Trin 5B.
 */

import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { OfferBillingMode } from '@/types/offers.types'

export interface OfferPartyCustomer {
  id: string
  company_name: string | null
  contact_person: string | null
  customer_number: string | null
  email: string | null
}

export interface OfferParties {
  /** True when billing_mode='same_as_customer' AND all three role IDs equal customer_id. */
  isAllSameAsCustomer: boolean
  billing_mode: OfferBillingMode | null
  /** Resolved primary customer_id from the offer (for client-side comparison). */
  primary_customer_id: string | null
  /** null when role equals primary customer_id (UI collapses to "same as primary"). */
  orderer: OfferPartyCustomer | null
  end_customer: OfferPartyCustomer | null
  payer: OfferPartyCustomer | null
}

export async function getOfferParties(
  offerId: string
): Promise<ActionResult<OfferParties>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(offerId, 'tilbud ID')

    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select(
        'customer_id, orderer_customer_id, end_customer_id, payer_customer_id, billing_mode'
      )
      .eq('id', offerId)
      .maybeSingle()

    if (offerErr || !offer) {
      logger.error('Could not load offer for parties', { error: offerErr, entityId: offerId })
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
    }

    const primaryId = (offer.customer_id as string | null) || null
    const ordererId = (offer.orderer_customer_id as string | null) || null
    const endId = (offer.end_customer_id as string | null) || null
    const payerId = (offer.payer_customer_id as string | null) || null
    const billingMode = (offer.billing_mode as OfferBillingMode | null) || null

    const allSameAsPrimary =
      billingMode === 'same_as_customer' &&
      ordererId === primaryId &&
      endId === primaryId &&
      payerId === primaryId

    // Collect role IDs that differ from primary (we only need to fetch those).
    const extraIds = new Set<string>()
    if (ordererId && ordererId !== primaryId) extraIds.add(ordererId)
    if (endId && endId !== primaryId) extraIds.add(endId)
    if (payerId && payerId !== primaryId) extraIds.add(payerId)

    const partyMap = new Map<string, OfferPartyCustomer>()
    if (extraIds.size > 0) {
      const { data: customers, error: custErr } = await supabase
        .from('customers')
        .select('id, company_name, contact_person, customer_number, email')
        .in('id', Array.from(extraIds))

      if (custErr) {
        logger.error('Could not load offer party customers', { error: custErr, entityId: offerId })
      } else if (customers) {
        for (const c of customers) {
          partyMap.set(c.id as string, {
            id: c.id as string,
            company_name: (c.company_name as string | null) || null,
            contact_person: (c.contact_person as string | null) || null,
            customer_number: (c.customer_number as string | null) || null,
            email: (c.email as string | null) || null,
          })
        }
      }
    }

    const resolve = (roleId: string | null): OfferPartyCustomer | null => {
      if (!roleId || roleId === primaryId) return null
      return partyMap.get(roleId) || null
    }

    return {
      success: true,
      data: {
        isAllSameAsCustomer: allSameAsPrimary,
        billing_mode: billingMode,
        primary_customer_id: primaryId,
        orderer: resolve(ordererId),
        end_customer: resolve(endId),
        payer: resolve(payerId),
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente sagspartner-roller') }
  }
}
