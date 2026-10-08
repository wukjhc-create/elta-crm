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
  type EmployeeEconomyRow,
} from '@/lib/services/employee-economy'
import type { ActionResult } from '@/types/common.types'

/**
 * D50b (privacy): kost/DB pr. medarbejder afslører medarbejderens kostsats (kost / timer) → kun employees.payroll.view.
 * Øvrige kostpris-roller (serviceleder, bogholderi) får timer + salg pr. medarbejder og kost/DB som samlede totaler.
 */
export type EmployeeEconomyViewRow = Omit<EmployeeEconomyRow, 'labor_cost' | 'db_amount' | 'db_percentage'> & {
  labor_cost: number | null
  db_amount: number | null
  db_percentage: number | null
}
export interface EmployeeEconomyView extends Omit<EmployeeEconomyResult, 'employees'> {
  employees: EmployeeEconomyViewRow[]
  /** labor_cost/db_* er null uden employees.payroll.view, når totalen ville afsløre én medarbejders løn (se nedenfor) */
  totals: { hours: number; labor_sale: number; labor_cost: number | null; db_amount: number | null; db_percentage: number | null }
  /** true = kost/DB pr. medarbejder (employees.payroll.view) */
  per_employee_cost: boolean
}

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
): Promise<ActionResult<EmployeeEconomyView>> {
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
    const r2 = (n: number) => Math.round(n * 100) / 100
    const hours = r2(data.employees.reduce((s, e) => s + e.hours, 0))
    const sale = r2(data.employees.reduce((s, e) => s + e.labor_sale, 0))
    const cost = r2(data.employees.reduce((s, e) => s + e.labor_cost, 0))
    const perEmployeeCost = ctx.hasPermission('employees.payroll.view')
    // Kode-review (privatliv): uden løn-adgang må totalen ikke være ÉN medarbejders kost — filter på én medarbejder
    // (employeeId) eller en periode hvor kun én har kost gav præcis den løn, D50b skulle skjule. Mindst 2 påkrævet.
    const withCost = data.employees.filter((e) => e.labor_cost > 0).length
    const hideTotalCost = !perEmployeeCost && (!!employeeId || withCost < 2)
    const totals = hideTotalCost
      ? { hours, labor_sale: sale, labor_cost: null, db_amount: null, db_percentage: null }
      : { hours, labor_sale: sale, labor_cost: cost, db_amount: r2(sale - cost), db_percentage: sale > 0 ? r2(((sale - cost) / sale) * 100) : 0 }
    const employees: EmployeeEconomyViewRow[] = perEmployeeCost
      ? data.employees
      : data.employees.map((e) => ({ ...e, labor_cost: null, db_amount: null, db_percentage: null }))
    return { success: true, data: { ...data, employees, totals, per_employee_cost: perEmployeeCost } }
  } catch (error) {
    logger.error('getEmployeeEconomyAction failed', { error })
    return { success: false, error: formatError(error, 'Kunne ikke hente medarbejderøkonomi') }
  }
}
