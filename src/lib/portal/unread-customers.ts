/**
 * DB-15e (dashboard-review 2026-10-19): kunder med ulæste portalbeskeder fra kunden — til kundelistens filter
 * (?portalUnread=1), som cockpittets kort "Kundebeskeder (portal)" linker til. Bevidst IKKE 'use server': kaldes kun fra
 * kundesiden efter rettighedstjek (customers.edit, samme som kortet). Læses med brugerens session (RLS).
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

/** Højst så mange kunde-id'er i listefilteret (PostgREST .in()-grænse ~350 UUID) — ældste ulæste først. */
export const PORTAL_UNREAD_CUSTOMER_CAP = 300

export async function unreadPortalCustomerIds(client: Client): Promise<string[]> {
  const rows = await fetchAllRows<{ customer_id: string | null; created_at: string }>((f, t) => client
    .from('portal_messages')
    .select('customer_id, created_at')
    .eq('sender_type', 'customer')
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .order('id')
    .range(f, t))
  const ids: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.customer_id || seen.has(r.customer_id)) continue
    seen.add(r.customer_id)
    ids.push(r.customer_id)
    if (ids.length >= PORTAL_UNREAD_CUSTOMER_CAP) break
  }
  return ids
}
