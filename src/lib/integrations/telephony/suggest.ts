/**
 * 00247 (låst beslutning 4–6): kunde-FORSLAG for et lagret opkald. Bevidst IKKE 'use server'. Kun med
 * TELEPHONY_MATCH_MODE=suggest; kaldes af webhooken efter en ny hændelse (service_role).
 *
 *  - Opslag på det normaliserede eksterne nummer i kunder (phone/mobile) og kundekontakter (samme regel som CTI-kortet,
 *    lib/integrations/relatel/lookup.ts). Leads tæller ikke (de er ingen kunde).
 *  - 0 kunder → forbliver 'unmatched'; præcis 1 → 'suggested' + suggested_customer_id; flere → 'ambiguous' + antal
 *    (ingen id-liste gemmes). Flere kontakter på SAMME kunde = én kunde.
 *  - Sætter ALDRIG customer_id eller sag — også ét entydigt match er kun et forslag (DB-triggeren afviser det også).
 *  - Rører kun opkald der stadig er 'unmatched' uden kunde: en menneskelig beslutning (bekræftet, afvist) overskrives aldrig.
 * Forslaget giver ingen adgang: et ubekræftet opkald ses kun med calls.view_unmatched, og listen viser kun forslagets
 * kunde, hvis brugeren selv kan se kunden (lib/telephony/call-actions-core.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { lookupCaller } from '@/lib/integrations/relatel/lookup'

export type SuggestOutcome = 'suggested' | 'ambiguous' | 'no_match' | 'no_number' | 'skipped' | 'error'

export async function suggestCustomerForCall(admin: SupabaseClient, callId: string): Promise<{ outcome: SuggestOutcome; candidates: number }> {
  const { data: call, error } = await admin
    .from('telephony_calls')
    .select('id, external_number_normalized, match_status, customer_id')
    .eq('id', callId)
    .maybeSingle()
  if (error || !call) return { outcome: 'error', candidates: 0 }
  const c = call as { external_number_normalized: string | null; match_status: string; customer_id: string | null }
  if (c.customer_id || c.match_status !== 'unmatched') return { outcome: 'skipped', candidates: 0 }
  if (!c.external_number_normalized) return { outcome: 'no_number', candidates: 0 }

  const lookup = await lookupCaller(admin, c.external_number_normalized)
  const customerIds = [...new Set(lookup.matches.filter((m) => m.kind !== 'lead' && m.customer_id).map((m) => m.customer_id as string))]
  if (customerIds.length === 0) return { outcome: 'no_match', candidates: 0 }
  const patch = customerIds.length === 1
    ? { match_status: 'suggested', suggested_customer_id: customerIds[0], candidate_count: 1 }
    : { match_status: 'ambiguous', suggested_customer_id: null, candidate_count: Math.min(customerIds.length, 1000) }
  const { error: upErr } = await admin
    .from('telephony_calls')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', callId)
    .eq('match_status', 'unmatched')
    .is('customer_id', null)
  if (upErr) return { outcome: 'error', candidates: customerIds.length }
  return { outcome: customerIds.length === 1 ? 'suggested' : 'ambiguous', candidates: customerIds.length }
}
