/**
 * Central rate-accessor — Sprint 2D (Time Price Consolidation).
 *
 * Ét sted at hente timepriser, så vi undgår de spredte fallbacks (450/650)
 * og direkte CALC_DEFAULTS-brug ude i kalkulations-, profitabilitets- og
 * faktura-flows. Call-sites omlægges hertil i senere commits.
 *
 * Master-hierarki:
 *   - Standard salgspris pr. rolle : `calculation_settings.hourly_rates` (DB master)
 *                                     → fallback: FALLBACK_SALE_RATE
 *   - Medarbejder-kostpris/time     : `employees.cost_rate` (mirror af
 *                                     `employee_compensation`) → fallback: FALLBACK_COST_RATE
 *
 * Canonical nød-fallbacks (CTO-besluttet 2026-06-11). De fyrer KUN når
 * masterdata mangler og afspejler IKKE nødvendigvis den aktive sats i drift
 * (i prod er fx aktiv elektriker-salgspris = 695 fra calculation_settings).
 *
 * Læser via admin-client, så accessoren også virker i kontekster uden
 * bruger-session (cron, auto-flow, AI).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

/** Nød-fallback for medarbejder-kostpris/time når cost-data mangler. */
export const FALLBACK_COST_RATE = 400

/** Nød-fallback for standard salgspris/time når calculation_settings mangler. */
export const FALLBACK_SALE_RATE = 495

export type EmployeeRole = 'electrician' | 'apprentice' | 'master' | 'helper'

export interface StandardRates {
  electrician: number
  apprentice: number
  master: number
  helper: number
}

/** calculation_settings.setting_key pr. rolle (matcher seed + calculation-settings.ts). */
const SALE_RATE_KEYS: Record<EmployeeRole, string> = {
  electrician: 'hourly_rate_electrician',
  apprentice: 'hourly_rate_apprentice',
  master: 'hourly_rate_master',
  helper: 'hourly_rate_helper',
}

/**
 * Standard salgspriser pr. rolle fra `calculation_settings` (master).
 * Manglende/ugyldige rækker falder tilbage til FALLBACK_SALE_RATE pr. rolle.
 */
export async function getStandardRates(): Promise<StandardRates> {
  const rates: StandardRates = {
    electrician: FALLBACK_SALE_RATE,
    apprentice: FALLBACK_SALE_RATE,
    master: FALLBACK_SALE_RATE,
    helper: FALLBACK_SALE_RATE,
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('calculation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', Object.values(SALE_RATE_KEYS))

    if (error) {
      logger.warn('getStandardRates: kunne ikke læse calculation_settings — bruger fallback', { error })
      return rates
    }

    for (const row of data ?? []) {
      const val = row.setting_value as { rate?: number } | null
      const rate = typeof val?.rate === 'number' && val.rate > 0 ? val.rate : null
      if (rate === null) continue
      for (const role of Object.keys(SALE_RATE_KEYS) as EmployeeRole[]) {
        if (SALE_RATE_KEYS[role] === row.setting_key) rates[role] = rate
      }
    }

    return rates
  } catch (err) {
    logger.warn('getStandardRates: uventet fejl — bruger fallback', { error: err })
    return rates
  }
}

/**
 * Standard salgspris for én rolle (default 'electrician').
 * Master = calculation_settings; fallback = FALLBACK_SALE_RATE.
 */
export async function getStandardSaleRate(role: EmployeeRole = 'electrician'): Promise<number> {
  const rates = await getStandardRates()
  const r = rates[role]
  return typeof r === 'number' && r > 0 ? r : FALLBACK_SALE_RATE
}

/**
 * Medarbejderens kostpris/time (master = `employees.cost_rate`, der er
 * trigger-mirror af `employee_compensation`). Fallback = FALLBACK_COST_RATE
 * når medarbejder/cost-data mangler.
 */
export async function getEmployeeCostRate(employeeId: string): Promise<number> {
  if (!employeeId) return FALLBACK_COST_RATE

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('employees')
      .select('cost_rate')
      .eq('id', employeeId)
      .maybeSingle()

    if (error || !data) return FALLBACK_COST_RATE
    const cost = Number(data.cost_rate)
    return Number.isFinite(cost) && cost > 0 ? cost : FALLBACK_COST_RATE
  } catch (err) {
    logger.warn('getEmployeeCostRate: uventet fejl — bruger fallback', { error: err, metadata: { employeeId } })
    return FALLBACK_COST_RATE
  }
}
