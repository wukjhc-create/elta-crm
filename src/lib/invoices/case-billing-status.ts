/**
 * Sprint Ø8.2 — Faktureringsstatus pr. sag (isomorf, cost-free).
 *
 * Rene afledninger oven på Ø8.1's batch-økonomi (CaseEconomyBatchEntry) +
 * sagens status. Bruges af BÅDE server (global filtrering) og klient (badge),
 * så reglerne kun findes ét sted. Ingen server-imports, ingen kost/margin/DB.
 */

import type { CaseEconomyBatchEntry } from '@/lib/actions/service-case-economy'

/** Sager i slutstatus (afsluttet) — "klar til slutfaktura" gælder kun her. */
export const CLOSED_CASE_STATUSES: ReadonlySet<string> = new Set(['closed'])

export type CaseBillingBadge =
  | 'over_invoiced'    // net_invoiced > kontraktsum
  | 'ready_final'      // afsluttet sag + restbeløb at fakturere
  | 'fully_invoiced'   // kontraktsum fuldt faktureret (rest = 0)
  | 'partly_invoiced'  // kontraktsum, men rest > 0 (ikke afsluttet)
  | 'no_contract'      // ingen kontraktsum
  | 'none'             // ingen kontraktsum + ingen fakturaer → intet at vise

export type CaseBillingFilter = 'outstanding' | 'ready_final' | 'over_invoiced' | 'no_contract'

export const CASE_BILLING_FILTERS: readonly CaseBillingFilter[] = [
  'outstanding', 'ready_final', 'over_invoiced', 'no_contract',
] as const

export const CASE_BILLING_FILTER_LABELS: Record<CaseBillingFilter, string> = {
  outstanding: 'Har udestående',
  ready_final: 'Klar til slutfaktura',
  over_invoiced: 'Overfaktureret',
  no_contract: 'Ingen kontraktsum',
}

export const CASE_BILLING_BADGE_CONFIG: Record<CaseBillingBadge, { label: string; cls: string }> = {
  over_invoiced:   { label: 'Overfaktureret',      cls: 'bg-red-50 text-red-700 ring-red-200' },
  ready_final:     { label: 'Klar til slutfaktura', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  fully_invoiced:  { label: 'Fuldt faktureret',    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  partly_invoiced: { label: 'Delvist faktureret',  cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  no_contract:     { label: 'Ingen kontraktsum',   cls: 'bg-gray-100 text-gray-500 ring-gray-200' },
  none:            { label: '',                     cls: '' },
}

/** Primær faktureringsstatus-badge for en sag. */
export function caseBillingBadge(
  e: CaseEconomyBatchEntry | undefined,
  caseStatus: string | null | undefined
): CaseBillingBadge {
  if (!e) return 'none'
  if (!e.has_contract_sum) {
    return e.invoice_count > 0 ? 'no_contract' : 'none'
  }
  const remaining = e.remaining_to_invoice
  if (remaining == null) return 'none'
  if (remaining < 0) return 'over_invoiced'
  if (remaining === 0) return 'fully_invoiced'
  // remaining > 0
  if (CLOSED_CASE_STATUSES.has(caseStatus ?? '')) return 'ready_final'
  return 'partly_invoiced'
}

/** Matcher en sag det aktive faktureringsfilter? (server-side global filtrering) */
export function caseMatchesBillingFilter(
  e: CaseEconomyBatchEntry | undefined,
  caseStatus: string | null | undefined,
  filter: CaseBillingFilter
): boolean {
  if (!e) return false
  switch (filter) {
    case 'outstanding':
      return e.outstanding_total > 0
    case 'over_invoiced':
      return e.has_contract_sum && e.remaining_to_invoice != null && e.remaining_to_invoice < 0
    case 'ready_final':
      return (
        e.has_contract_sum &&
        e.remaining_to_invoice != null &&
        e.remaining_to_invoice > 0 &&
        CLOSED_CASE_STATUSES.has(caseStatus ?? '')
      )
    case 'no_contract':
      return !e.has_contract_sum
    default:
      return false
  }
}
