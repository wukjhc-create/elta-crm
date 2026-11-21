/**
 * Kørsels-lease for baggrundsjob (00253). Bevidst IKKE 'use server' — ren logik med injiceret RPC, så den kan testes.
 *
 * Mail-sync kører hvert 5. minut (vercel.json) og kan også startes manuelt; uden lås kunne to kørsler overlappe og begge
 * behandle samme ubehandlede mail. withSyncLease kører kun opgaven, hvis leasen kunne tages:
 *   acquired     → opgaven kører; leasen frigives altid bagefter (også ved fejl)
 *   busy         → en anden kørsel holder en gyldig lease → opgaven springes over (intet hentes/behandles)
 *   unavailable  → 00253 findes ikke (funktionen mangler) → opgaven kører UDEN lås (adfærd som før 00253) + advarsel
 *   error        → anden fejl ved låsning → opgaven springes over (fail closed — næste planlagte kørsel prøver igen)
 * En kørsel der dræbes (timeout) frigiver ikke; leasen udløber efter TTL og overtages da.
 */

export type LeaseRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>

export type LeaseOutcome = 'acquired' | 'busy' | 'unavailable' | 'error'

/** Mail-sync: maxDuration 300 s + margen. En dræbt kørsel blokerer højst til næste-næste planlagte kørsel. */
export const EMAIL_SYNC_LEASE = { name: 'email-sync', ttlSeconds: 330 } as const

const MISSING_FN = new Set(['42883', 'PGRST202'])

export async function acquireSyncLease(rpc: LeaseRpc, name: string, ttlSeconds: number): Promise<{ outcome: LeaseOutcome; holder: string | null; code?: string }> {
  try {
    const { data, error } = await rpc('sync_lease_acquire', { p_name: name, p_ttl_seconds: ttlSeconds })
    if (error) return { outcome: MISSING_FN.has(String(error.code ?? '')) ? 'unavailable' : 'error', holder: null, code: error.code }
    return typeof data === 'string' && data ? { outcome: 'acquired', holder: data } : { outcome: 'busy', holder: null }
  } catch {
    return { outcome: 'error', holder: null }
  }
}

export async function releaseSyncLease(rpc: LeaseRpc, name: string, holder: string): Promise<boolean> {
  try {
    const { data, error } = await rpc('sync_lease_release', { p_name: name, p_holder: holder })
    return !error && data === true
  } catch {
    return false
  }
}

export async function withSyncLease<T>(
  rpc: LeaseRpc,
  lease: { name: string; ttlSeconds: number },
  task: () => Promise<T>,
  onSkip: (outcome: 'busy' | 'error') => T,
  onUnavailable?: () => void,
): Promise<{ outcome: LeaseOutcome; value: T }> {
  const got = await acquireSyncLease(rpc, lease.name, lease.ttlSeconds)
  if (got.outcome === 'busy' || got.outcome === 'error') return { outcome: got.outcome, value: onSkip(got.outcome) }
  if (got.outcome === 'unavailable') { onUnavailable?.(); return { outcome: 'unavailable', value: await task() } }
  try {
    return { outcome: 'acquired', value: await task() }
  } finally {
    await releaseSyncLease(rpc, lease.name, got.holder as string)
  }
}
