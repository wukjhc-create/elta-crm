/**
 * S-5 (pilot-review 2026-10-15): den automatiske "Følg op: … intet svar modtaget"-opgave (oprettes ved afsendelse af et
 * tilbud) lukkes, når kunden har svaret (accepteret/afvist) — før blev den stående på underskrevne tilbud. Bevidst IKKE
 * 'use server' (kaldes fra server-actions med en admin-klient, også fra portalen hvor der ikke er en CRM-bruger).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export const FOLLOW_UP_TITLE_PREFIX = 'Følg op:'

export async function closeOfferFollowUpTasks(admin: SupabaseClient, offerId: string): Promise<void> {
  try {
    const { error } = await admin
      .from('customer_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('offer_id', offerId)
      .ilike('title', `${FOLLOW_UP_TITLE_PREFIX}%`)
      .neq('status', 'done')
    if (error) logger.warn('closeOfferFollowUpTasks failed', { error, entityId: offerId })
    // TK-7 (review 2026-10-17): også opfølgningsagentens opgaver ("Opfoelgning: tilbud …", auto_rule
    // agent_followup_offer — lib/agents/followup-agent.ts) — de blev stående efter accept/afvisning
    const { error: agentErr } = await admin
      .from('customer_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('offer_id', offerId)
      .eq('auto_rule', 'agent_followup_offer')
      .neq('status', 'done')
    if (agentErr) logger.warn('closeOfferFollowUpTasks (agent) failed', { error: agentErr, entityId: offerId })
  } catch (err) {
    logger.warn('closeOfferFollowUpTasks threw', { error: err, entityId: offerId })
  }
}
