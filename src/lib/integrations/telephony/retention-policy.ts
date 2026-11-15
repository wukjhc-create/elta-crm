/**
 * Telefoni-retention — FORSLAG (Relatel final review 2026-11-15). Ren funktion, ikke koblet på noget job og ikke
 * planlagt. Den eneste aktive regel i databasen er stadig telephony_purge_unconfirmed() (90 dage for ubekræftede),
 * og den er ikke planlagt i vercel.json. Se docs/runbooks/RELATEL_FINAL_REVIEW.md §Retention.
 *
 * Kategorier og foreslåede frister (Henrik beslutter tallene for bekræftede):
 *  - unmatched     ubekræftet opkald (ukendt/forslag/tvetydig/afvist): 90 dage efter seneste aktivitet (= DB i dag)
 *  - matched       opkald bekræftet på en kunde, uden sag: 36 måneder (forslag)
 *  - case_linked   opkald koblet til en sag: så længe sagen er åben; derefter 36 måneder efter lukning (forslag)
 *  - events        rå livscyklus-hændelser (kun hash): 90 dage efter opkaldets afslutning (kun fejlsøgning)
 *  - voicemail     telefonsvarer-METADATA følger opkaldet (ingen lyd gemmes nogensinde)
 *  - message       SMS/chat-metadata (hvis det senere indtages): samme regler som opkald
 * Ukendt alder (manglende tidspunkt) → behold og meld (aldrig slet i blinde).
 */

export const TELEPHONY_RETENTION_DAYS = {
  unmatched: 90,
  matched: 36 * 30,
  caseClosed: 36 * 30,
  events: 90,
} as const

export interface RetentionSubject {
  customerId: string | null
  serviceCaseId: string | null
  /** sagens lukketidspunkt; null = åben (eller ukendt sag) */
  caseClosedAt: string | null
  startedAt: string | null
  endedAt: string | null
}

export type RetentionDecision =
  | { action: 'keep'; reason: 'within_period' | 'case_open' }
  | { action: 'delete'; category: 'unmatched' | 'matched' | 'case_linked' }
  | { action: 'review'; reason: 'unknown_age' }

const DAY = 86_400_000

export function telephonyRetentionDecision(s: RetentionSubject, now: Date): RetentionDecision {
  const last = Date.parse(s.endedAt ?? s.startedAt ?? '')
  if (Number.isNaN(last)) return { action: 'review', reason: 'unknown_age' }
  const age = (now.getTime() - last) / DAY
  if (!s.customerId) return age > TELEPHONY_RETENTION_DAYS.unmatched ? { action: 'delete', category: 'unmatched' } : { action: 'keep', reason: 'within_period' }
  if (s.serviceCaseId) {
    if (!s.caseClosedAt) return { action: 'keep', reason: 'case_open' }
    const closed = Date.parse(s.caseClosedAt)
    if (Number.isNaN(closed)) return { action: 'review', reason: 'unknown_age' }
    const since = (now.getTime() - Math.max(closed, last)) / DAY
    return since > TELEPHONY_RETENTION_DAYS.caseClosed ? { action: 'delete', category: 'case_linked' } : { action: 'keep', reason: 'within_period' }
  }
  return age > TELEPHONY_RETENTION_DAYS.matched ? { action: 'delete', category: 'matched' } : { action: 'keep', reason: 'within_period' }
}

/** Rå hændelser (hash) må ryddes efter 90 dage, når opkaldet er afsluttet — opkaldsrækken bevares */
export function telephonyEventPurgeable(callEndedAt: string | null, now: Date): boolean {
  const t = Date.parse(callEndedAt ?? '')
  return !Number.isNaN(t) && (now.getTime() - t) / DAY > TELEPHONY_RETENTION_DAYS.events
}
