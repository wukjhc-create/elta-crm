/**
 * Mails der allerede har et lead (leads.custom_fields.source_email_id). Pagineret med .range() + fast rækkefølge —
 * PostgREST returnerer højst max_rows (1000) pr. kald, så .limit(5000) gav et tilfældigt udsnit, når der blev mange
 * leads (kode-review 2026-10-04). Klienten afgør synligheden (RLS).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function leadSourceEmailIds(supabase: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; from < 50_000; from += 1000) {
    // S-12 (pilot-review 2026-10-15): kun JSON-stien — før hele custom_fields (inkl. vedhæftnings-arrays) ved hver
    // dashboard-indlæsning
    const { data, error } = await supabase.from('leads').select('id, source_email_id:custom_fields->>source_email_id')
      .not('custom_fields->>source_email_id', 'is', null).order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const l of (data ?? []) as Array<{ source_email_id: string | null }>) {
      if (l.source_email_id) out.add(l.source_email_id)
    }
    if (!data || data.length < 1000) break
  }
  return out
}
