/**
 * Sprint Ø4.1 — URL ↔ filter-mapping for fakturaoverblikket.
 *
 * Isomorft og uden eksterne imports, så det kan unit-testes direkte.
 * URL-værdier er deep-linkbare; interne nøgler driver klientfiltreringen.
 */

export type FilterKey = 'all' | 'draft' | 'sent' | 'overdue' | 'paid' | 'credited'

export const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'draft', label: 'Kladder' },
  { key: 'sent', label: 'Sendte' },
  { key: 'overdue', label: 'Forfaldne' },
  { key: 'paid', label: 'Betalte' },
  { key: 'credited', label: 'Krediterede / annullerede' },
]

// 'closed' (URL) = krediterede/annullerede internt. Ukendt → 'all'.
export const URL_TO_FILTER: Record<string, FilterKey> = {
  all: 'all',
  draft: 'draft',
  sent: 'sent',
  overdue: 'overdue',
  paid: 'paid',
  closed: 'credited',
  credited: 'credited',
}

export const FILTER_TO_URL: Record<FilterKey, string> = {
  all: 'all',
  draft: 'draft',
  sent: 'sent',
  overdue: 'overdue',
  paid: 'paid',
  credited: 'closed',
}

export function parseFilter(raw: string | null | undefined): FilterKey {
  return (raw && URL_TO_FILTER[raw]) || 'all'
}

/** Specifikke tom-tilstande pr. filter. */
export const EMPTY_TEXT: Record<FilterKey, string> = {
  all: 'Der er ingen fakturaer endnu.',
  draft: 'Der er ingen kladder lige nu.',
  sent: 'Der er ingen sendte fakturaer lige nu.',
  overdue: 'Der er ingen forfaldne fakturaer lige nu.',
  paid: 'Der er ingen betalte fakturaer lige nu.',
  credited: 'Der er ingen krediterede eller annullerede fakturaer lige nu.',
}
