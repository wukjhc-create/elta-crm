/**
 * Når et tilbud accepteres (kundeportal eller medarbejder), markeres de tilknyttede leads som vundet,
 * så salgspipelinen ("Vundne leads") ikke står stille. Tilknyttet = tilbuddets lead_id, eller et lead
 * der er konverteret til tilbuddets kunde (N13: custom_fields.customer_id).
 *
 * Kun åbne leads (ikke allerede vundet/tabt). Afvisning sætter bevidst IKKE "tabt" (et lead kan have
 * flere tilbud). Kaster aldrig — fejl logges; acceptén må ikke vælte.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

const OPEN_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation']

export async function markLeadsWonForAcceptedOffer(
  admin: SupabaseClient,
  offerId: string,
  actorId: string | null
): Promise<{ updated: number }> {
  try {
    const { data: offer } = await admin
      .from('offers')
      .select('id, offer_number, lead_id, customer_id, created_by')
      .eq('id', offerId)
      .maybeSingle()
    if (!offer) return { updated: 0 }
    const performer = actorId ?? (offer.created_by as string | null)
    if (!performer) return { updated: 0 }

    const ids = new Set<string>()
    if (offer.lead_id) ids.add(offer.lead_id as string)
    if (offer.customer_id) {
      const { data: converted } = await admin
        .from('leads')
        .select('id')
        .eq('custom_fields->>customer_id', offer.customer_id as string)
        .limit(20)
      for (const l of (converted ?? []) as Array<{ id: string }>) ids.add(l.id)
    }
    if (ids.size === 0) return { updated: 0 }

    const { data: won } = await admin
      .from('leads')
      .update({ status: 'won' })
      .in('id', [...ids])
      .in('status', OPEN_STATUSES)
      .select('id')
    const wonIds = ((won ?? []) as Array<{ id: string }>).map((l) => l.id)
    if (wonIds.length > 0) {
      await admin.from('lead_activities').insert(
        wonIds.map((id) => ({
          lead_id: id,
          activity_type: 'status_change',
          description: `Vundet — tilbud ${offer.offer_number as string} accepteret`,
          performed_by: performer,
        }))
      )
    }
    return { updated: wonIds.length }
  } catch (err) {
    logger.error('markLeadsWonForAcceptedOffer failed (non-critical)', { error: err, entityId: offerId })
    return { updated: 0 }
  }
}
