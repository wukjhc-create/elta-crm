/**
 * ÉN model for arbejdskost (Eltas kost pr. arbejdstime) — forslag (Henrik 2026-10-14, "Løs 295 vs 400 systematisk").
 * Ren logik, ingen DB; bevidst IKKE 'use server'. Se docs/design/labour-cost-model.md.
 *
 * Prioritet (første brugbare værdi vinder; 0/negativ/ikke-tal = mangler — fanger real_hourly_cost=0-fælden):
 *   1. snapshot           frosset kost på en timeregistrering (time_logs.cost_rate_snapshot) — den FAKTISKE kost
 *   2. explicit           sats brugeren eksplicit har valgt til et estimat (fx "lærling") — aldrig stille
 *   3. medarbejder        efter firmaets kostbasis (company_settings.time_cost_basis):
 *                           real_hourly_cost    → real → intern
 *                           internal_cost_rate  → intern → real
 *                           fixed_standard_rate → (springes over; standard bruges)
 *   4. company_standard   firmaets standard-timekost (company_settings.time_cost_rate) — den ENE centrale fallback
 *   5. fallback           FALLBACK_LABOUR_COST_RATE (400) — kun når intet er sat
 *
 * NB: SALGSPRIS (timepris) er en anden størrelse og håndteres ikke her (calculation_settings.hourly_rate_*).
 * Status: IKKE koblet på prod-stier endnu — "ingen prod-adfærdsændring før modellen er konsistent".
 */

/** Sidste-udvejs kost pr. time (samme værdi som FALLBACK_COST_RATE i services/rates.ts og SQL-rate-motoren 00144). */
export const FALLBACK_LABOUR_COST_RATE = 400

export type LabourCostBasis = 'real_hourly_cost' | 'internal_cost_rate' | 'fixed_standard_rate'

export type LabourCostSource =
  | 'snapshot'
  | 'explicit'
  | 'employee_real'
  | 'employee_internal'
  | 'company_standard'
  | 'fallback'

export interface LabourCostInput {
  /** Frosset kost pr. time på en registrering (faktisk) */
  snapshotRate?: number | null
  /** Eksplicit valgt sats til et estimat — fx lærlingesats valgt af brugeren */
  explicit?: { rate: number | null | undefined; label: 'apprentice' | 'manual' } | null
  /** Medarbejderens kostgrundlag (employee_compensation) */
  employee?: { realHourlyCost?: number | null; internalCostRate?: number | null } | null
  basis?: LabourCostBasis | null
  /** company_settings.time_cost_rate */
  companyStandardRate?: number | null
}

export interface LabourCostResult {
  rate: number
  source: LabourCostSource
  /** Brugervenlig forklaring (vises fx ved "kost beregnet med …") */
  label: string
}

const usable = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

export function resolveLabourCostRate(input: LabourCostInput): LabourCostResult {
  if (usable(input.snapshotRate)) return { rate: input.snapshotRate, source: 'snapshot', label: 'faktisk kost (frosset på registreringen)' }
  if (input.explicit && usable(input.explicit.rate)) {
    return { rate: input.explicit.rate, source: 'explicit', label: input.explicit.label === 'apprentice' ? 'lærlingesats (valgt)' : 'manuel sats (valgt)' }
  }
  const basis = input.basis ?? 'real_hourly_cost'
  const real = input.employee?.realHourlyCost
  const internal = input.employee?.internalCostRate
  if (basis === 'real_hourly_cost') {
    if (usable(real)) return { rate: real, source: 'employee_real', label: 'medarbejderens reelle timekost' }
    if (usable(internal)) return { rate: internal, source: 'employee_internal', label: 'medarbejderens interne kostsats' }
  } else if (basis === 'internal_cost_rate') {
    if (usable(internal)) return { rate: internal, source: 'employee_internal', label: 'medarbejderens interne kostsats' }
    if (usable(real)) return { rate: real, source: 'employee_real', label: 'medarbejderens reelle timekost' }
  }
  if (usable(input.companyStandardRate)) return { rate: input.companyStandardRate, source: 'company_standard', label: 'firmaets standard-timekost' }
  return { rate: FALLBACK_LABOUR_COST_RATE, source: 'fallback', label: `standard-timekost (${FALLBACK_LABOUR_COST_RATE} kr/t — ikke indstillet)` }
}

/** Kost for et antal timer med samme model (afrundet til øre). */
export function labourCostFor(hours: number, input: LabourCostInput): LabourCostResult & { amount: number } {
  const r = resolveLabourCostRate(input)
  return { ...r, amount: Math.round(Math.max(0, hours) * r.rate * 100) / 100 }
}
