/**
 * 00240 forudsætning 4 (Henrik 2026-10-27): FAIL-CLOSED sags-værn til skrivehandlinger. Server-modul (ikke 'use server').
 *
 * Før læste værnene sagens status med brugerens klient eller via et embed og behandlede "ingen række" som "ikke
 * lukket". Når RLS (00240) skjuler en sag for brugeren, ville en ændring på en LUKKET sag så slippe igennem. Her læses
 * sagens egen status med admin-klienten — EFTER kalderens rettigheds-/scope-tjek — og en manglende række eller læsefejl
 * AFVISER handlingen. Returnerer kun en dansk fejltekst eller null; ingen sagsdata udleveres.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export const CASE_UNREADABLE_MSG = 'Sagen kunne ikke læses — handlingen er afvist'
export const CASE_CLOSED_MSG = 'Sagen er lukket — genåbn den først'
export const CASE_PROPOSAL_MSG = 'Sagen er et forslag — godkend den først'

export interface CaseWriteState { status: string; is_proposal: boolean }

/** Sagens status (admin). null = findes ikke eller kunne ikke læses → kalderen skal afvise */
export async function readCaseWriteState(caseId: string): Promise<CaseWriteState | null> {
  const { data, error } = await createAdminClient().from('service_cases').select('status, is_proposal').eq('id', caseId).maybeSingle()
  if (error) {
    logger.error('readCaseWriteState: sagen kunne ikke læses', { error, entityId: caseId })
    return null
  }
  if (!data) return null
  return { status: String((data as { status: string }).status), is_proposal: !!(data as { is_proposal?: boolean }).is_proposal }
}

/** Fejltekst hvis sagen ikke må ændres (ulæselig, lukket, evt. forslag) — ellers null */
export async function caseWriteBlock(caseId: string, opts: { blockProposal?: boolean } = {}): Promise<string | null> {
  const st = await readCaseWriteState(caseId)
  if (!st) return CASE_UNREADABLE_MSG
  if (st.status === 'closed') return CASE_CLOSED_MSG
  if (opts.blockProposal && st.is_proposal) return CASE_PROPOSAL_MSG
  return null
}

/** Status for flere sager på én gang (admin, i bidder). Manglende id i resultatet = ulæselig → behandl som blokeret */
export async function readCaseStatuses(caseIds: readonly string[]): Promise<Map<string, CaseWriteState> | null> {
  const ids = [...new Set(caseIds)]
  const out = new Map<string, CaseWriteState>()
  const admin = createAdminClient()
  for (let k = 0; k < ids.length; k += 200) {
    const { data, error } = await admin.from('service_cases').select('id, status, is_proposal').in('id', ids.slice(k, k + 200))
    if (error) {
      logger.error('readCaseStatuses: sager kunne ikke læses', { error })
      return null
    }
    for (const r of (data ?? []) as Array<{ id: string; status: string; is_proposal?: boolean }>) {
      out.set(r.id, { status: String(r.status), is_proposal: !!r.is_proposal })
    }
  }
  return out
}
