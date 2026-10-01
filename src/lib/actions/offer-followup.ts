'use server'

/**
 * Tilbudsopfølgning for sælgeren (GO-LIVE N1). Kun LÆSNING. Gate offers.view.
 * Salg ser egne tilbud (created_by); admin/serviceleder ser alle (de følger op på hele butikken).
 */
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { buildOfferFollowups, type OfferFollowupItem, type OpenOffer } from '@/lib/followup/offer-followup'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import type { ActionResult } from '@/types/common.types'

export async function getOfferFollowupsAction(): Promise<ActionResult<{ items: OfferFollowupItem[]; scope: 'own' | 'all' }>> {
  try {
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) return { success: false, error: 'Manglende tilladelse: offers.view' }
    const scope: 'own' | 'all' = role === 'admin' || role === 'serviceleder' ? 'all' : 'own'

    let q = supabase
      .from('offers')
      .select('id, offer_number, title, status, sent_at, viewed_at, valid_until, final_amount, reminder_count, last_reminder_sent, is_proposal, customer:customers!offers_customer_id_fkey(company_name, contact_person, phone)')
      .in('status', ['sent', 'viewed'])
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true })
      .limit(200)
    if (scope === 'own') q = q.eq('created_by', userId)
    const { data, error } = await q
    if (error) return { success: false, error: 'Kunne ikke hente tilbud' }
    const rows = ((data ?? []) as Array<Record<string, any>>).filter((r) => !r.is_proposal)

    const ids = rows.map((r) => r.id as string)
    const openTask = new Set<string>()
    if (ids.length) {
      const { data: tasks } = await supabase.from('customer_tasks').select('offer_id').in('offer_id', ids).in('status', ['pending', 'in_progress'])
      for (const t of (tasks ?? []) as Array<{ offer_id: string | null }>) if (t.offer_id) openTask.add(t.offer_id)
    }

    const offers: OpenOffer[] = rows.map((r) => ({
      id: r.id, offer_number: r.offer_number ?? null, title: r.title ?? '', status: r.status, sent_at: r.sent_at, viewed_at: r.viewed_at ?? null,
      valid_until: r.valid_until ?? null, final_amount: r.final_amount != null ? Number(r.final_amount) : null,
      reminder_count: Number(r.reminder_count ?? 0), last_reminder_sent: r.last_reminder_sent ?? null,
      customer_name: r.customer?.company_name || r.customer?.contact_person || null, customer_phone: r.customer?.phone ?? null,
      has_open_task: openTask.has(r.id),
    }))
    return { success: true, data: { items: buildOfferFollowups(offers, copenhagenParts(new Date()).date), scope } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente opfølgning') }
  }
}
