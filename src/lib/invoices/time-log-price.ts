/**
 * Én prisregel for fakturering af timer — bruges af del-faktura
 * (invoice-from-case), slutfaktura (invoice-stage) og kladde-visningen,
 * så det viste beløb altid er det fakturerede.
 *
 *   1. Frosset salgssnapshot (time_logs.sale_amount fra rate engine) vinder —
 *      historiske timer faktureres ikke med nye/live satser (Sprint Ø2.11).
 *   2. Ellers live employees.hourly_rate (> 0).
 *   3. Ellers fallback-sats (markeres, så UI/advarsler kan vise det).
 */

export const DEFAULT_FALLBACK_HOURLY_RATE = 650

export interface TimeLogPriceInput {
  hours: number | string | null
  sale_amount?: number | string | null
  sale_rate_snapshot?: number | string | null
  live_hourly_rate?: number | string | null
}

export interface TimeLogPrice {
  hours: number
  /** Sats pr. time på fakturalinjen. */
  rate: number
  total: number
  source: 'snapshot' | 'live' | 'fallback'
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const r2 = (n: number) => Math.round(n * 100) / 100

export function priceTimeLog(
  input: TimeLogPriceInput,
  fallbackRate: number = DEFAULT_FALLBACK_HOURLY_RATE
): TimeLogPrice {
  const hours = num(input.hours) ?? 0
  const saleSnap = num(input.sale_amount)
  const rateSnap = num(input.sale_rate_snapshot)
  const live = num(input.live_hourly_rate)
  const liveOk = live != null && live > 0

  if (saleSnap != null) {
    const total = r2(saleSnap)
    const rate =
      rateSnap != null ? rateSnap : hours > 0 ? r2(total / hours) : liveOk ? live : fallbackRate
    return { hours, rate, total, source: 'snapshot' }
  }
  if (liveOk) return { hours, rate: live, total: r2(hours * live), source: 'live' }
  return { hours, rate: fallbackRate, total: r2(hours * fallbackRate), source: 'fallback' }
}
