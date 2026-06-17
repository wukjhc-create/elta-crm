/**
 * Sprint Ø9.1 — Forfaldsregler for leverandørfakturaer (isomorf).
 *
 * Ren afledning af forfaldsstatus ud fra due_date. Bruges af BÅDE server
 * (widget-summary + liste-side) og klient (badge + filter), så reglerne kun
 * findes ét sted. INTERN indkøbsøkonomi — kun for incoming_invoices.view.
 * Ingen secrets, ingen server-imports.
 */

export type IncomingDueBadge = 'overdue' | 'due_soon' | 'no_due_date' | 'ok'
export type IncomingDueFilter = 'overdue' | 'due_7' | 'due_14' | 'no_due_date'

export const INCOMING_DUE_FILTERS: readonly IncomingDueFilter[] = [
  'overdue', 'due_7', 'due_14', 'no_due_date',
] as const

export const INCOMING_DUE_FILTER_LABELS: Record<IncomingDueFilter, string> = {
  overdue: 'Forfalden',
  due_7: 'Forfalder inden 7 dage',
  due_14: 'Forfalder inden 14 dage',
  no_due_date: 'Ingen forfaldsdato',
}

export const INCOMING_DUE_BADGE_CONFIG: Record<IncomingDueBadge, { label: string; cls: string }> = {
  overdue:     { label: 'Forfalden',         cls: 'bg-red-50 text-red-700 ring-red-200' },
  due_soon:    { label: 'Forfalder snart',   cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  no_due_date: { label: 'Ingen forfaldsdato', cls: 'bg-gray-100 text-gray-500 ring-gray-200' },
  ok:          { label: 'OK',                cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
}

/** YYYY-MM-DD-streng N dage efter en given dato (string-sammenligning er sikker). */
export function isoPlusDays(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Normalisér en due_date til ren YYYY-MM-DD (eller null). */
function dayOnly(due: string | null | undefined): string | null {
  if (!due) return null
  return String(due).slice(0, 10)
}

/** Forfaldsbadge for en faktura. "Snart" = inden 7 dage. */
export function incomingDueBadge(due: string | null | undefined, todayIso: string): IncomingDueBadge {
  const d = dayOnly(due)
  if (!d) return 'no_due_date'
  if (d < todayIso) return 'overdue'
  if (d <= isoPlusDays(todayIso, 7)) return 'due_soon'
  return 'ok'
}

/** Matcher en faktura det aktive forfaldsfilter? */
export function matchesIncomingDueFilter(
  due: string | null | undefined,
  filter: IncomingDueFilter,
  todayIso: string
): boolean {
  const d = dayOnly(due)
  switch (filter) {
    case 'no_due_date':
      return d == null
    case 'overdue':
      return d != null && d < todayIso
    case 'due_7':
      return d != null && d >= todayIso && d <= isoPlusDays(todayIso, 7)
    case 'due_14':
      return d != null && d >= todayIso && d <= isoPlusDays(todayIso, 14)
    default:
      return false
  }
}
