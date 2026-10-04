/**
 * N71: skal mailen synkroniseres nu? (ren logik, ingen I/O)
 *
 * Prod 2026-10-04: email-sync-cron kører kun dagligt kl. 05 (Vercel), og mail-siden synker kun mens den er åben →
 * cockpittet (webhenvendelser, "kræver svar") viste mails op til et døgn for sent. Cockpittet synker derfor selv, når
 * en KONFIGURERET postkasse er ældre end grænsen. Postkasser i graph_sync_state, der ikke længere er konfigureret
 * (fx crm@ siden februar), tæller ikke — ellers ville hver sidevisning udløse en synk.
 */
export interface MailboxSyncState { mailbox: string; last_sync_at: string | null }

export function staleMailboxes(configured: string[], states: MailboxSyncState[], nowMs: number, maxAgeMinutes: number): string[] {
  const byMailbox = new Map(states.map((s) => [s.mailbox.trim().toLowerCase(), s.last_sync_at]))
  return configured
    .map((m) => m.trim().toLowerCase())
    .filter((m) => {
      const last = byMailbox.get(m)
      if (!last) return true
      const t = Date.parse(last)
      return !Number.isFinite(t) || nowMs - t > maxAgeMinutes * 60_000
    })
}
