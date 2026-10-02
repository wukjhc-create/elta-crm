/**
 * N24a — retro-kobling: ukoblede mails fra en kundes adresse kobles til kunden.
 *
 * Fund (prod read-only 2026-10-02): 81 ukoblede mails var sendt fra en KENDT kundes adresse — typisk modtaget før
 * kunden blev oprettet, og mail-sync'en kobler kun ved modtagelse. De var derfor usynlige på kundekortet og for
 * bogholderi (D28).
 * Kun mails uden kunde og som ikke er bevidst ignoreret; sag-koblede mails røres ikke. Bruger-sessionen (RLS) skriver,
 * så kun roller der må koble mails kan det. Kaster aldrig.
 */
import { pgQuote, escapeLike } from '@/lib/validations/postgrest-filter'
import { logger } from '@/lib/utils/logger'

type Client = { from: (t: string) => any }

function addressFilter(email: string): string {
  const q = pgQuote(escapeLike(email.trim().toLowerCase()))
  return `sender_email.ilike.${q},original_sender_email.ilike.${q}`
}

export async function countUnlinkedEmailsFromAddress(supabase: Client, email: string | null | undefined): Promise<number> {
  if (!email || !email.includes('@')) return 0
  const { count } = await supabase
    .from('incoming_emails')
    .select('id', { count: 'exact', head: true })
    .is('customer_id', null)
    .neq('link_status', 'ignored')
    .or(addressFilter(email))
  return count ?? 0
}

export async function linkUnlinkedEmailsFromAddress(supabase: Client, customerId: string, email: string | null | undefined): Promise<number> {
  if (!email || !email.includes('@')) return 0
  try {
    const { data, error } = await supabase
      .from('incoming_emails')
      .update({ customer_id: customerId, link_status: 'linked', linked_by: 'retro', linked_at: new Date().toISOString() })
      .is('customer_id', null)
      .neq('link_status', 'ignored')
      .or(addressFilter(email))
      .select('id')
    if (error) { logger.warn('retro-kobling af mails fejlede', { error, entityId: customerId }); return 0 }
    return (data ?? []).length
  } catch (err) {
    logger.warn('retro-kobling af mails kastede', { error: err, entityId: customerId })
    return 0
  }
}
