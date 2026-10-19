/**
 * DB-3 (dashboard-review 2026-10-18): ÉN definition af "tilbud der skal følges op" — bruges af cockpittets tal og af
 * tilbudslisten (?followup=1), så linket viser præcis de tilbud tallet tæller (før: tal = sendt/set > 7 dage efter
 * afsendelse, link = alle sendte uanset alder og uden "set").
 */
export const OFFER_FOLLOWUP_DAYS = 7
export const OFFER_FOLLOWUP_STATUSES = ['sent', 'viewed'] as const

/** PostgREST .or()-udtryk: afsendt før cutoff (uden sent_at: oprettet før cutoff). */
export function offerFollowupAgeFilter(now: number = Date.now()): string {
  const cutoff = new Date(now - OFFER_FOLLOWUP_DAYS * 86_400_000).toISOString()
  return `sent_at.lt.${cutoff},and(sent_at.is.null,created_at.lt.${cutoff})`
}
