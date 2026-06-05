'use server'

/**
 * Sprint 12A Trin 5A — Offer parties read-only loader.
 * Sprint 12A Trin 5B — updateOfferParties (mutation, status-guarded).
 *
 * No mail-routing change. Mail-router (resolveOfferMailRoute) already
 * reads these fields and was deployed in Trin 4.
 */

import { revalidatePath } from 'next/cache'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import { OFFER_BILLING_MODES, type OfferBillingMode } from '@/types/offers.types'

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

// =====================================================
// Send-offer-dialog — recipient candidates
// =====================================================

export type OfferRecipientRole =
  | 'primary_customer'
  | 'billing_contact'
  | 'orderer'
  | 'payer'
  | 'end_customer'
  | 'contact'
  | 'manual'

export interface OfferRecipientCandidate {
  email: string
  label: string            // fx "Kundens primaere e-mail (Test Lars 45)"
  role: OfferRecipientRole
  customerId: string | null
  contactId: string | null
  isPrimary: boolean       // true for primary customer.email
  isDefault: boolean       // true for det resolveOfferMailRoute ville vaelge uden override
}

export interface OfferRecipientCandidatesResult {
  candidates: OfferRecipientCandidate[]
  defaultRecipientEmail: string | null
  defaultRoleLabel: string | null
  primaryCustomerEmail: string | null   // til UI-advarsel hvis valgt != primaer
}

const ROLE_LABEL_MAP: Record<Exclude<OfferRecipientRole, 'manual'>, string> = {
  primary_customer: 'Kundens primære e-mail',
  billing_contact: 'Billing-kontakt',
  orderer: 'Ordregiver',
  payer: 'Betaler',
  end_customer: 'Slutkunde / anlægsejer',
  contact: 'Kontaktperson',
}

/**
 * Returnér alle relevante modtager-kandidater til send-offer-dialog.
 * Default-modtager matcher resolveOfferMailRoute (billing-contact foer
 * customers.email paa active-party). Dedupes paa email (case-insensitive).
 */
export async function getOfferRecipientCandidates(
  offerId: string
): Promise<ActionResult<OfferRecipientCandidatesResult>> {
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
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
    }

    const primaryId = (offer.customer_id as string | null) || null
    const ordererId = (offer.orderer_customer_id as string | null) || null
    const endId = (offer.end_customer_id as string | null) || null
    const payerId = (offer.payer_customer_id as string | null) || null
    const billingMode = (offer.billing_mode as string | null) || 'same_as_customer'

    if (!primaryId) {
      return { success: false, error: 'Tilbud har ingen tilknyttet kunde' }
    }

    // Active-party via samme switch som resolveOfferMailRoute
    let activeId: string
    switch (billingMode) {
      case 'end_customer_pays':
        activeId = endId || primaryId
        break
      case 'third_party_pays':
        activeId = payerId || primaryId
        break
      default: // orderer_pays / same_as_customer / unknown
        activeId = ordererId || primaryId
        break
    }

    // Hent alle relevante customers paa én gang
    const uniqueIds = Array.from(
      new Set([primaryId, ordererId, endId, payerId, activeId].filter((id): id is string => !!id))
    )
    const { data: customers } = await supabase
      .from('customers')
      .select('id, company_name, contact_person, email')
      .in('id', uniqueIds)

    const customerMap = new Map<string, { id: string; name: string; email: string | null }>()
    for (const c of customers || []) {
      customerMap.set(c.id as string, {
        id: c.id as string,
        name: (c.company_name as string | null) || (c.contact_person as string | null) || 'Ukendt',
        email: (c.email as string | null) || null,
      })
    }

    // Hent billing-contact paa active-party
    const { data: billingContact } = await supabase
      .from('customer_contacts')
      .select('id, name, email')
      .eq('customer_id', activeId)
      .eq('role', 'billing')
      .not('email', 'is', null)
      .limit(1)
      .maybeSingle()

    // Hent oevrige kontakter paa primaer kunde (for bredere kandidat-liste)
    const { data: otherContacts } = await supabase
      .from('customer_contacts')
      .select('id, name, email, role')
      .eq('customer_id', primaryId)
      .not('email', 'is', null)
      .limit(10)

    // Byg kandidat-liste i prioritets-rækkefølge
    const candidates: OfferRecipientCandidate[] = []
    const seenEmails = new Set<string>()

    const addCandidate = (c: Omit<OfferRecipientCandidate, 'isDefault'>) => {
      if (!c.email) return
      const key = c.email.toLowerCase().trim()
      if (!key || seenEmails.has(key)) return
      seenEmails.add(key)
      candidates.push({ ...c, isDefault: false })
    }

    // Bestem default-email (matcher resolveOfferMailRoute)
    const billingEmail = (billingContact?.email as string | null) || null
    const activeCustomerEmail = customerMap.get(activeId)?.email || null
    const defaultEmail = billingEmail
      ? billingEmail.toLowerCase().trim()
      : (activeCustomerEmail ? activeCustomerEmail.toLowerCase().trim() : null)

    // 1) Billing-kontakt (hvis findes paa active-party)
    if (billingContact?.email && billingContact.id) {
      const activeName = customerMap.get(activeId)?.name || ''
      addCandidate({
        email: billingContact.email as string,
        label: `${ROLE_LABEL_MAP.billing_contact}${activeName ? ` (${activeName})` : ''}${billingContact.name ? ` — ${billingContact.name as string}` : ''}`,
        role: 'billing_contact',
        customerId: activeId,
        contactId: billingContact.id as string,
        isPrimary: false,
      })
    }

    // 2) Primaer kunde
    const primaryCust = customerMap.get(primaryId)
    if (primaryCust?.email) {
      addCandidate({
        email: primaryCust.email,
        label: `${ROLE_LABEL_MAP.primary_customer} (${primaryCust.name})`,
        role: 'primary_customer',
        customerId: primaryId,
        contactId: null,
        isPrimary: true,
      })
    }

    // 3) Ordregiver/betaler/slutkunde — kun hvis forskellig fra primaer
    const addPartyIfDifferent = (
      id: string | null,
      role: 'orderer' | 'payer' | 'end_customer'
    ) => {
      if (!id || id === primaryId) return
      const cust = customerMap.get(id)
      if (!cust?.email) return
      addCandidate({
        email: cust.email,
        label: `${ROLE_LABEL_MAP[role]} (${cust.name})`,
        role,
        customerId: id,
        contactId: null,
        isPrimary: false,
      })
    }
    addPartyIfDifferent(ordererId, 'orderer')
    addPartyIfDifferent(payerId, 'payer')
    addPartyIfDifferent(endId, 'end_customer')

    // 4) Oevrige kontakter paa primaer kunde
    for (const ct of otherContacts || []) {
      if (billingContact?.id && ct.id === billingContact.id) continue
      addCandidate({
        email: ct.email as string,
        label: `${ROLE_LABEL_MAP.contact} — ${(ct.name as string | null) || 'Kontakt'}${ct.role ? ` (${ct.role as string})` : ''}`,
        role: 'contact',
        customerId: primaryId,
        contactId: ct.id as string,
        isPrimary: false,
      })
    }

    // Marker default-kandidat
    if (defaultEmail) {
      const defaultIdx = candidates.findIndex(
        (c) => c.email.toLowerCase().trim() === defaultEmail
      )
      if (defaultIdx >= 0) {
        candidates[defaultIdx].isDefault = true
      }
    }

    const defaultCandidate = candidates.find((c) => c.isDefault) || null
    const defaultRoleLabel = defaultCandidate
      ? ROLE_LABEL_MAP[defaultCandidate.role as Exclude<OfferRecipientRole, 'manual'>] || null
      : null

    return {
      success: true,
      data: {
        candidates,
        defaultRecipientEmail: defaultCandidate?.email || null,
        defaultRoleLabel,
        primaryCustomerEmail: primaryCust?.email || null,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente modtager-kandidater') }
  }
}

// =====================================================
// Trin 5B — updateOfferParties (mutation)
// =====================================================

const EDITABLE_STATUSES = new Set(['draft', 'sent', 'viewed'])

export interface UpdateOfferPartiesInput {
  /** null = same as primary customer_id. */
  orderer_customer_id: string | null
  /** null = same as primary customer_id. */
  end_customer_id: string | null
  /** null = same as primary customer_id. */
  payer_customer_id: string | null
  billing_mode: OfferBillingMode
}

export async function updateOfferParties(
  offerId: string,
  input: UpdateOfferPartiesInput
): Promise<ActionResult<{ offer_id: string }>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.edit')) {
      return { success: false, error: 'Manglende tilladelse: offers.edit' }
    }
    validateUUID(offerId, 'tilbud ID')

    if (!OFFER_BILLING_MODES.includes(input.billing_mode)) {
      return { success: false, error: 'Ugyldig billing_mode' }
    }

    // Load offer for status + customer_id guard
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, status, customer_id')
      .eq('id', offerId)
      .maybeSingle()

    if (offerErr || !offer) {
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
    }

    const primaryId = (offer.customer_id as string | null) || null
    if (!primaryId) {
      return {
        success: false,
        error: 'Tilbuddet mangler primær kunde — vælg en kunde først',
      }
    }

    const status = (offer.status as string) || ''
    if (!EDITABLE_STATUSES.has(status)) {
      return {
        success: false,
        error: `Sagspartnere kan kun redigeres på tilbud i status kladde, sendt eller set (nuværende status: ${status})`,
      }
    }

    // Normalize roles. same_as_customer forces all to primary; otherwise
    // null roles fall back to primary.
    const sameAsCustomer = input.billing_mode === 'same_as_customer'
    const ordererId = sameAsCustomer ? primaryId : input.orderer_customer_id || primaryId
    const endId = sameAsCustomer ? primaryId : input.end_customer_id || primaryId
    const payerId = sameAsCustomer ? primaryId : input.payer_customer_id || primaryId

    // Validate UUIDs syntactically (cheap fail-fast before DB roundtrip)
    for (const [name, id] of [
      ['orderer_customer_id', ordererId],
      ['end_customer_id', endId],
      ['payer_customer_id', payerId],
    ] as const) {
      try {
        validateUUID(id, name)
      } catch {
        return { success: false, error: `Ugyldig ${name}` }
      }
    }

    // Validate FK targets exist (skip primary — we already loaded the offer
    // with this customer_id so we know it's valid via FK constraint).
    const extraIds = new Set<string>()
    if (ordererId !== primaryId) extraIds.add(ordererId)
    if (endId !== primaryId) extraIds.add(endId)
    if (payerId !== primaryId) extraIds.add(payerId)

    if (extraIds.size > 0) {
      const { data: existing, error: existErr } = await supabase
        .from('customers')
        .select('id')
        .in('id', Array.from(extraIds))

      if (existErr) {
        logger.error('Could not validate party customers', { error: existErr, entityId: offerId })
        return { success: false, error: 'Kunne ikke validere valgte kunder' }
      }

      const foundIds = new Set((existing || []).map((c) => c.id as string))
      for (const id of extraIds) {
        if (!foundIds.has(id)) {
          return { success: false, error: `Valgt kunde findes ikke (id ${id})` }
        }
      }
    }

    // Persist
    const { error: updErr } = await supabase
      .from('offers')
      .update({
        orderer_customer_id: ordererId,
        end_customer_id: endId,
        payer_customer_id: payerId,
        billing_mode: input.billing_mode,
      })
      .eq('id', offerId)

    if (updErr) {
      logger.error('Could not update offer parties', { error: updErr, entityId: offerId })
      return { success: false, error: 'Kunne ikke gemme sagspartnere' }
    }

    revalidatePath(`/dashboard/offers/${offerId}`)
    revalidatePath('/dashboard/offers')

    return { success: true, data: { offer_id: offerId } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme sagspartnere') }
  }
}
