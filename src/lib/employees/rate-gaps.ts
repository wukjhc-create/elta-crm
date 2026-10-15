/**
 * 00230 (Henrik 2026-10-15): hvilke medarbejdere kan ikke registrere tid fordi en sats mangler? Samme regel som
 * DB-sats-motoren (compute_time_log_rates, normal tid): salg = timepris; kost afhænger af firmaets kostbasis.
 * Kun ja/nej — ingen beløb. Ren funktion.
 */
export type CostBasis = 'real_hourly_cost' | 'internal_cost_rate' | 'fixed_standard_rate' | string | null

export interface RateGapInput { hourly_rate: number | string | null; cost_rate: number | string | null; real_hourly_cost: number | string | null }
export interface RateGap { missingSale: boolean; missingCost: boolean }

const has = (v: number | string | null | undefined) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))

export function employeeRateGap(e: RateGapInput, basis: CostBasis, fixedRate: number | string | null): RateGap {
  const b = basis ?? 'real_hourly_cost'
  const cost = b === 'fixed_standard_rate'
    ? has(fixedRate) || has(e.cost_rate) || has(e.real_hourly_cost)
    : has(e.cost_rate) || has(e.real_hourly_cost)
  return { missingSale: !has(e.hourly_rate), missingCost: !cost }
}

export function rateGapText(g: RateGap): string | null {
  if (g.missingSale && g.missingCost) return 'Mangler timepris og kostpris'
  if (g.missingSale) return 'Mangler timepris'
  if (g.missingCost) return 'Mangler kostpris'
  return null
}
