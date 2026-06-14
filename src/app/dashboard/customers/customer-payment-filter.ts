/**
 * Sprint Ø4.5 — URL ↔ betalingsfilter/-sortering for kundelisten.
 *
 * Isomorft, uden eksterne imports → unit-testbart. Filter er GLOBALT
 * (matchende customer_ids beregnes server-side før paginering). Sortering
 * er SIDE-LOKAL på de viste kunder (mærket tydeligt i UI).
 */

export type PaymentFilterKey =
  | 'all'
  | 'overdue'
  | 'outstanding'
  | 'late_payer'
  | 'on_time'
  | 'no_data'

export const PAYMENT_FILTERS: Array<{ key: PaymentFilterKey; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'overdue', label: 'Forfaldne' },
  { key: 'outstanding', label: 'Udestående' },
  { key: 'late_payer', label: 'Ofte forsinket' },
  { key: 'on_time', label: 'Betaler til tiden' },
  { key: 'no_data', label: 'Ingen betalingsdata' },
]

const VALID_FILTERS = new Set<PaymentFilterKey>(PAYMENT_FILTERS.map((f) => f.key))

export function parsePaymentFilter(raw: string | null | undefined): PaymentFilterKey {
  return raw && VALID_FILTERS.has(raw as PaymentFilterKey) ? (raw as PaymentFilterKey) : 'all'
}

/** Global filter → ærlige, specifikke tom-tekster. */
export const PAYMENT_EMPTY_TEXT: Record<PaymentFilterKey, string> = {
  all: 'Der er ingen kunder, der matcher.',
  overdue: 'Der er ingen kunder med forfaldne fakturaer.',
  outstanding: 'Der er ingen kunder med udestående fakturaer.',
  late_payer: 'Der er ingen kunder markeret som ofte forsinkede.',
  on_time: 'Der er ingen kunder markeret som "betaler til tiden".',
  no_data: 'Der er ingen kunder uden betalingsdata.',
}

// ---- Sortering (SIDE-LOKAL på de viste kunder) ----
export type PaymentSortKey = 'default' | 'outstanding_desc' | 'overdue_desc'

export const PAYMENT_SORTS: Array<{ key: PaymentSortKey; label: string }> = [
  { key: 'default', label: 'Standard' },
  { key: 'outstanding_desc', label: 'Størst udestående' },
  { key: 'overdue_desc', label: 'Flest forfaldne' },
]

const VALID_SORTS = new Set<PaymentSortKey>(PAYMENT_SORTS.map((s) => s.key))

export function parsePaymentSort(raw: string | null | undefined): PaymentSortKey {
  return raw && VALID_SORTS.has(raw as PaymentSortKey) ? (raw as PaymentSortKey) : 'default'
}
