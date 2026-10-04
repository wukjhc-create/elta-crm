/**
 * N23 — sagsstatus følger arbejdet (ren logik, ingen I/O).
 *
 * Fund (prod read-only 2026-10-02): alle 8 sager stod "new", selv med job, timer og fakturaer — intet flyttede status.
 *   - En sag går automatisk fra "new" til "in_progress", når arbejdet begynder (job startet/udført eller tid registreret).
 *     Kun fra "new": en sag som kontoret har sat "pending"/"closed"/"converted" røres aldrig automatisk.
 *   - En sag er "klar til lukning", når mindst ét job er udført, ingen job er åbne (planned/in_progress), intet
 *     fakturerbart står ufaktureret og ingen timer kører. Selve lukningen er et aktivt valg (cases.close) og går
 *     gennem lukke-værnet (D23).
 */
import type { UnbilledSummary } from '@/lib/invoices/unbilled'

export type WorkStartTrigger = 'work_order_started' | 'work_order_done' | 'time_logged'

export function shouldAutoStartCase(caseStatus: string | null | undefined): boolean {
  return caseStatus === 'new'
}

export const WORK_START_LABELS: Record<WorkStartTrigger, string> = {
  work_order_started: 'job startet',
  work_order_done: 'job udført',
  time_logged: 'tid registreret',
}

export interface CloseReadinessInput {
  caseStatus: string | null | undefined
  workOrderStatuses: string[]
  unbilled: Pick<UnbilledSummary, 'count' | 'openTimer'>
}

export interface CloseReadiness {
  ready: boolean
  /** Kort dansk forklaring (vises i UI når ready=false og sagen er i gang). */
  reason: string
  doneJobs: number
  openJobs: number
}

export function caseCloseReadiness(input: CloseReadinessInput): CloseReadiness {
  const doneJobs = input.workOrderStatuses.filter((s) => s === 'done').length
  const openJobs = input.workOrderStatuses.filter((s) => s === 'planned' || s === 'in_progress').length
  const base = { doneJobs, openJobs }
  if (input.caseStatus !== 'in_progress' && input.caseStatus !== 'pending' && input.caseStatus !== 'new') {
    return { ...base, ready: false, reason: 'Sagen er ikke åben' }
  }
  if (doneJobs === 0) return { ...base, ready: false, reason: 'Intet job er udført endnu' }
  if (openJobs > 0) return { ...base, ready: false, reason: `${openJobs} job er ikke afsluttet` }
  if (input.unbilled.openTimer) return { ...base, ready: false, reason: 'Der kører en timer på sagen' }
  if (input.unbilled.count > 0) return { ...base, ready: false, reason: `${input.unbilled.count} post(er) er ikke faktureret` }
  return { ...base, ready: true, reason: 'Alle job er udført, og alt er faktureret' }
}

/**
 * N58: sager der står som "Ny" selvom arbejdet er i gang (job startet/udført, tid registreret eller faktura udstedt) —
 * typisk sager fra før N23-automatikken. Forslaget er et aktivt valg på sagen (ingen automatisk dataændring).
 */
export interface StartHintInput {
  caseStatus: string | null | undefined
  workOrderStatuses: string[]
  timeLogCount: number
  issuedInvoiceCount: number
}

export function caseStartHint(input: StartHintInput): { suggest: boolean; reason: string } {
  if (input.caseStatus !== 'new') return { suggest: false, reason: '' }
  const started = input.workOrderStatuses.filter((s) => s === 'in_progress' || s === 'done').length
  const parts: string[] = []
  if (started > 0) parts.push(`${started} job startet/udført`)
  if (input.timeLogCount > 0) parts.push(`${input.timeLogCount} timeregistrering${input.timeLogCount === 1 ? '' : 'er'}`)
  if (input.issuedInvoiceCount > 0) parts.push(`${input.issuedInvoiceCount} faktura${input.issuedInvoiceCount === 1 ? '' : 'er'} udstedt`)
  return parts.length ? { suggest: true, reason: parts.join(', ') } : { suggest: false, reason: '' }
}
