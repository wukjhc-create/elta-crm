/**
 * LD-3 (leads-review 2026-10-18): når et lead kobles til en kunde — uanset vej (konvertering, "Kobl til eksisterende
 * kunde", "Opret kunde fra mail") — skal leadets tilbud uden kunde og leadets kildemail følge med. Før skete det kun i
 * konverteringens "opret kunde"-gren, så tilbud oprettet på leadet stod uden kunde (ingen Send-knap, kunne ikke blive sag).
 *
 * Best-effort: fejl logges, koblingen af selve leadet er allerede sket. Bevidst IKKE 'use server' (kaldes server-side).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export interface LeadLinkResult { offersLinked: number; emailLinked: boolean }

export async function linkLeadArtifactsToCustomer(
  supabase: SupabaseClient,
  opts: { leadId: string; customerId: string; sourceEmailId?: unknown; canEditOffers: boolean; canLinkInbox: boolean; linkedBy: string },
): Promise<LeadLinkResult> {
  const out: LeadLinkResult = { offersLinked: 0, emailLinked: false }
  // N77: kildemailen kobles til kunden (kun en ukoblet mail, kun med indbakke-adgang)
  if (typeof opts.sourceEmailId === 'string' && opts.canLinkInbox) {
    const { data, error } = await supabase.from('incoming_emails')
      .update({ customer_id: opts.customerId, link_status: 'linked', linked_by: opts.linkedBy, linked_at: new Date().toISOString() })
      .eq('id', opts.sourceEmailId).is('customer_id', null).select('id')
    if (error) logger.warn('linkLeadArtifactsToCustomer: kildemail ikke koblet', { error, entityId: opts.leadId })
    else out.emailLinked = (data ?? []).length > 0
  }
  // W-2: leadets tilbud UDEN kunde får kunden og parti-rollerne
  if (opts.canEditOffers) {
    const { data, error } = await supabase.from('offers')
      .update({ customer_id: opts.customerId, orderer_customer_id: opts.customerId, end_customer_id: opts.customerId, payer_customer_id: opts.customerId })
      .eq('lead_id', opts.leadId).is('customer_id', null).select('id')
    if (error) logger.warn('linkLeadArtifactsToCustomer: tilbud ikke koblet', { error, entityId: opts.leadId })
    else out.offersLinked = (data ?? []).length
  }
  return out
}
