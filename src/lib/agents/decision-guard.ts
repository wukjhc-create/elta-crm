/**
 * Stale-data-vagt for Agent Inbox (P1 #8). Bevidst IKKE 'use server' (ingen offentlig action).
 *
 * En reviewer med en gammel fane maa ikke faa "Godkendt"/"Afvist" paa et forslag som en anden allerede har
 * afgjort/udfoert; beslutningen afvises med en forstaaelig tekst og siden opdateres. Executor-gaten er
 * uafhaengig af dette (et forsinket approval kan aldrig udfoere en afvist action).
 */

/** Statusser hvor en ny beslutning ikke giver mening. */
export const DECIDED_STATUSES = ['executing', 'executed', 'rejected', 'failed', 'rolled_back', 'needs_verification'] as const

const STATUS_LABEL: Record<string, string> = {
  executing: 'ved at blive udført', executed: 'udført', rejected: 'afvist', failed: 'fejlet',
  rolled_back: 'rullet tilbage', needs_verification: 'afventer verifikation',
}

/** Fejltekst hvis forslaget ikke (laengere) kan afgoeres; null hvis beslutning er mulig. */
 
export async function staleDecisionError(admin: any, actionId: string): Promise<string | null> {
  const { data } = await admin.from('agent_actions').select('status').eq('id', actionId).maybeSingle()
  if (!data) return 'Forslaget findes ikke længere. Siden er opdateret.'
  const status = (data as { status: string }).status
  if ((DECIDED_STATUSES as readonly string[]).includes(status)) {
    return `Forslaget er allerede ${STATUS_LABEL[status] ?? status}. Siden er opdateret.`
  }
  return null
}
