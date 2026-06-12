/**
 * Sprint Ø1.3 commit 1 — getEmployeeEconomy (READ-ONLY service)
 *
 * Aggregerer medarbejderøkonomi (timer, løn-salg, løn-kost, DB, DB%) fra
 * time_logs' frosne snapshots (00136/00137 + backfill 00138).
 *
 * Kilder
 *   time_logs.hours        — registrerede timer
 *   time_logs.sale_amount  — FROSSET løn-salgsbeløb (snapshot)
 *   time_logs.cost_amount  — FROSSET løn-kostbeløb (snapshot)
 *   employees.name         — visningsnavn (fallback first/last/email)
 *
 * Regler
 *   - KUN lukkede time_logs (end_time IS NOT NULL).
 *   - Bruger udelukkende snapshot-beløbene — INGEN live rate-beregning.
 *   - Hvis sale_amount ELLER cost_amount mangler (NULL) på en lukket række:
 *     beløbet tæller som 0 (sikker fallback) og rækken tælles i
 *     missing_snapshot_count (både pr. medarbejder og totalt), så UI kan
 *     advare om at backfill mangler.
 *   - Beløb + DB% rundes til 2 decimaler.
 *   - DB  = labor_sale - labor_cost
 *   - DB% = DB / labor_sale * 100   (0 når labor_sale <= 0)
 *   - Sorteret efter db_amount faldende.
 *
 * Read-only: ingen writes, ingen DDL, ingen RPC. RLS gælder (server-klient).
 * from/to filtreres mod time_logs.start_time (arbejdets starttidspunkt).
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'

export interface EmployeeEconomyRow {
  employee_id: string
  employee_name: string
  hours: number
  labor_sale: number
  labor_cost: number
  db_amount: number
  db_percentage: number
  /** Antal lukkede time_logs for medarbejderen hvor et snapshot-beløb manglede. */
  missing_snapshot_count: number
}

export interface EmployeeEconomyResult {
  employees: EmployeeEconomyRow[]
  /** Sum af manglende snapshot-rækker på tværs af alle medarbejdere. */
  missing_snapshot_count: number
  from: string | null
  to: string | null
}

export interface GetEmployeeEconomyParams {
  from?: string
  to?: string
  employeeId?: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

type TimeLogRow = {
  hours: number | string | null
  cost_amount: number | string | null
  sale_amount: number | string | null
  employee_id: string | null
  employee:
    | { id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }
    | Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>
    | null
}

function displayName(emp: TimeLogRow['employee'], fallbackId: string): string {
  const e = Array.isArray(emp) ? emp[0] : emp
  if (!e) return fallbackId
  if (e.name && e.name.trim()) return e.name.trim()
  const full = [e.first_name, e.last_name].filter(Boolean).join(' ').trim()
  if (full) return full
  if (e.email && e.email.trim()) return e.email.trim()
  return fallbackId
}

export async function getEmployeeEconomy(
  params: GetEmployeeEconomyParams = {}
): Promise<EmployeeEconomyResult> {
  const { from, to, employeeId } = params
  const empty: EmployeeEconomyResult = {
    employees: [],
    missing_snapshot_count: 0,
    from: from ?? null,
    to: to ?? null,
  }

  try {
    if (employeeId) validateUUID(employeeId, 'employeeId')
    const supabase = await createClient()

    let query = supabase
      .from('time_logs')
      .select(
        'hours, cost_amount, sale_amount, employee_id, employee:employees(id, name, first_name, last_name, email)'
      )
      .not('end_time', 'is', null) // kun lukkede timer

    if (from) query = query.gte('start_time', from)
    if (to) query = query.lte('start_time', to)
    if (employeeId) query = query.eq('employee_id', employeeId)

    const { data, error } = await query
    if (error) {
      logger.error('getEmployeeEconomy: time_logs read failed', { error })
      return empty
    }

    const rows = (data ?? []) as TimeLogRow[]

    type Acc = {
      employee_id: string
      employee_name: string
      hours: number
      labor_sale: number
      labor_cost: number
      missing_snapshot_count: number
    }
    const byEmployee = new Map<string, Acc>()
    let totalMissing = 0

    for (const tl of rows) {
      const empId = tl.employee_id
      if (!empId) continue // employee_id er NOT NULL i skemaet; defensivt skip

      let acc = byEmployee.get(empId)
      if (!acc) {
        acc = {
          employee_id: empId,
          employee_name: tl.employee ? displayName(tl.employee, empId) : empId,
          hours: 0,
          labor_sale: 0,
          labor_cost: 0,
          missing_snapshot_count: 0,
        }
        byEmployee.set(empId, acc)
      }

      const hours = Number(tl.hours ?? 0)
      acc.hours += Number.isFinite(hours) ? hours : 0

      // Snapshot-only: manglende beløb -> 0 + tæl som missing.
      const saleNull = tl.sale_amount == null
      const costNull = tl.cost_amount == null
      const sale = saleNull ? 0 : Number(tl.sale_amount)
      const cost = costNull ? 0 : Number(tl.cost_amount)
      acc.labor_sale += Number.isFinite(sale) ? sale : 0
      acc.labor_cost += Number.isFinite(cost) ? cost : 0

      if (saleNull || costNull) {
        acc.missing_snapshot_count += 1
        totalMissing += 1
      }
    }

    const employees: EmployeeEconomyRow[] = Array.from(byEmployee.values()).map((a) => {
      const labor_sale = r2(a.labor_sale)
      const labor_cost = r2(a.labor_cost)
      const db_amount = r2(labor_sale - labor_cost)
      const db_percentage = labor_sale > 0 ? r2((db_amount / labor_sale) * 100) : 0
      return {
        employee_id: a.employee_id,
        employee_name: a.employee_name,
        hours: r2(a.hours),
        labor_sale,
        labor_cost,
        db_amount,
        db_percentage,
        missing_snapshot_count: a.missing_snapshot_count,
      }
    })

    employees.sort((x, y) => y.db_amount - x.db_amount)

    return {
      employees,
      missing_snapshot_count: totalMissing,
      from: from ?? null,
      to: to ?? null,
    }
  } catch (error) {
    logger.error('getEmployeeEconomy: unexpected error', { error })
    return empty
  }
}
