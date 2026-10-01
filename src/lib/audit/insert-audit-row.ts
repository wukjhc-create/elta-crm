/**
 * Server-only (IKKE 'use server'): skriv én audit_logs-række med service-role.
 *
 * Fund (GO-LIVE, 2026-10-01): audit_logs har INGEN INSERT-policy for authenticated → alle direkte
 * `supabase.from('audit_logs').insert(...)` med bruger-sessionen fejlede STILLE (fakturaer sendt/betalt/krediteret,
 * materialer, øvrige omkostninger, indstillinger, regnskab). Prod: 0 sådanne rækker. Kalderen har allerede
 * autentificeret brugeren og sætter user_id fra serversessionen — værdien kan ikke styres af klienten.
 * Fejl logges, men vælter aldrig forretningshandlingen (audit er best-effort som før).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export async function insertAuditRow(row: Record<string, unknown>): Promise<{ error: { message: string } | null }> {
  try {
    const { error } = await createAdminClient().from('audit_logs').insert(row)
    if (error) logger.warn('audit_logs insert fejlede', { error, metadata: { action: row.action, entity_type: row.entity_type } })
    return { error: error ? { message: error.message } : null }
  } catch (err) {
    logger.warn('audit_logs insert kastede', { error: err })
    return { error: { message: err instanceof Error ? err.message : 'ukendt' } }
  }
}
