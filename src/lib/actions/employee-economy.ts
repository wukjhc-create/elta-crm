'use server'

/**
 * Sprint Ø1.3 commit 2 — server action wrapper for medarbejderøkonomi.
 *
 * Tynd, sikker wrapper omkring den read-only service
 * src/lib/services/employee-economy.ts:getEmployeeEconomy. Tilføjer:
 *   - input-validering (UUID + ISO-dato + from<=to)
 *   - auth-gate (kun autentificerede brugere)
 *   - standard ActionResult-indpakning
 *
 * Ingen live rate-beregning (al økonomi kommer fra servicens snapshots).
 * Ingen UI, ingen migration, ingen DB-skrivning.
 */

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import {
  getEmployeeEconomy,
  type GetEmployeeEconomyParams,
  type EmployeeEconomyResult,
} from '@/lib/services/employee-economy'
import type { ActionResult } from '@/types/common.types'

/** Parse en valgfri ISO-dato/streng; kaster ved ugyldig værdi. */
function parseOptionalDate(value: string | undefined, field: string): Date | null {
  if (value == null || value === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Ugyldig dato for "${field}": ${value}`)
  }
  return d
}

export async function getEmployeeEconomyAction(
  params: GetEmployeeEconomyParams = {}
): Promise<ActionResult<EmployeeEconomyResult>> {
  try {
    const { from, to, employeeId } = params

    // --- Validering ---
    if (employeeId) validateUUID(employeeId, 'employeeId')

    const fromDate = parseOptionalDate(from, 'from')
    const toDate = parseOptionalDate(to, 'to')
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return { success: false, error: 'Ugyldig periode: "fra" er efter "til".' }
    }

    // --- Auth + permission-gate: intern løn-kost kræver economy.cost_prices ---
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('economy.cost_prices')) {
      return { success: false, error: 'Manglende tilladelse: economy.cost_prices' }
    }

    // --- Delegér til read-only service (RLS gælder) ---
    const data = await getEmployeeEconomy({ from, to, employeeId })
    return { success: true, data }
  } catch (error) {
    logger.error('getEmployeeEconomyAction failed', { error })
    return { success: false, error: formatError(error, 'Kunne ikke hente medarbejderøkonomi') }
  }
}
