/**
 * Salgspipelinen følger tilbuddene:
 *  - Tilbud SENDT → tilknyttet lead → "Tilbud sendt" (proposal), hvis det stadig står før tilbudsfasen.
 *  - Tilbud ACCEPTERET (kundeportal eller medarbejder) → tilknyttet lead → vundet.
 *
 * Tilknyttet lead = tilbuddets lead_id. Har tilbuddet intet lead_id, bruges et lead der er konverteret til
 * tilbuddets kunde (N13: custom_fields.customer_id) — men KUN hvis der er præcis ét åbent (leads-review
 * 2026-10-08: før blev ALLE kundens åbne leads markeret vundet ved én accept, også andre forespørgsler).
 *
 * Afvisning sætter bevidst IKKE "tabt" (et lead kan have flere tilbud). Kaster aldrig — fejl logges;
 * afsendelse/accept må ikke vælte.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

const OPEN_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation']
const PRE_PROPOSAL_STATUSES = ['new', 'contacted', 'qualified']

interface OfferRef {
  offer_number: string
  performer: string
  leadId: string | null
}

async function resolveOfferLead(
  admin: SupabaseClient,
  offerId: string,
  actorId: string | null,
  candidateStatuses: string[]
): Promise<OfferRef | null> {
  const { data: offer } = await admin
    .from('offers')
    .select('id, offer_number, lead_id, customer_id, created_by')
    .eq('id', offerId)
    .maybeSingle()
  if (!offer) return null
  const performer = actorId ?? (offer.created_by as string | null)
  if (!performer) return null
  if (offer.lead_id) return { offer_number: offer.offer_number as string, performer, leadId: offer.lead_id as string }
  if (!offer.customer_id) return null
  const { data: converted } = await admin
    .from('leads')
    .select('id')
    .eq('custom_fields->>customer_id', offer.customer_id as string)
    .in('status', candidateStatuses)
    .limit(2)
  const rows = (converted ?? []) as Array<{ id: string }>
  if (rows.length !== 1) {
    if (rows.length > 1) {
      logger.info('lead-pipeline: flere åbne leads på kunden — intet ændret automatisk', { entityId: offerId })
    }
    return null
  }
  return { offer_number: offer.offer_number as string, performer, leadId: rows[0].id }
}

async function moveLead(
  admin: SupabaseClient,
  ref: OfferRef,
  fromStatuses: string[],
  to: string,
  description: string
): Promise<number> {
  if (!ref.leadId) return 0
  const { data: moved } = await admin
    .from('leads')
    .update({ status: to })
    .eq('id', ref.leadId)
    .in('status', fromStatuses)
    .select('id')
  if (!moved || moved.length === 0) return 0
  await admin.from('lead_activities').insert({
    lead_id: ref.leadId,
    activity_type: 'status_change',
    description,
    performed_by: ref.performer,
  })
  return moved.length
}

export async function markLeadsWonForAcceptedOffer(
  admin: SupabaseClient,
  offerId: string,
  actorId: string | null
): Promise<{ updated: number }> {
  try {
    const ref = await resolveOfferLead(admin, offerId, actorId, OPEN_STATUSES)
    if (!ref) return { updated: 0 }
    const updated = await moveLead(admin, ref, OPEN_STATUSES, 'won', `Vundet — tilbud ${ref.offer_number} accepteret`)
    return { updated }
  } catch (err) {
    logger.error('markLeadsWonForAcceptedOffer failed (non-critical)', { error: err, entityId: offerId })
    return { updated: 0 }
  }
}

/** Leads-review 2026-10-08 (#9): leads kom aldrig i "Tilbud sendt" — tragten sprang direkte fra kvalificeret til vundet */
export async function markLeadProposalForSentOffer(
  admin: SupabaseClient,
  offerId: string,
  actorId: string | null
): Promise<{ updated: number }> {
  try {
    const ref = await resolveOfferLead(admin, offerId, actorId, PRE_PROPOSAL_STATUSES)
    if (!ref) return { updated: 0 }
    const updated = await moveLead(admin, ref, PRE_PROPOSAL_STATUSES, 'proposal', `Tilbud ${ref.offer_number} sendt`)
    return { updated }
  } catch (err) {
    logger.error('markLeadProposalForSentOffer failed (non-critical)', { error: err, entityId: offerId })
    return { updated: 0 }
  }
}
