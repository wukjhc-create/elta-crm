/**
 * Employee economics — pure calculations.
 *
 *   - calculateRealHourlyCost: same formula as the SQL generated column
 *     `employee_compensation.real_hourly_cost`, exposed in TS for live
 *     UI previews while the operator types into the form.
 *   - calculateProjectImpact: per-(employee, project) economic rollup
 *     from time_logs — billable hours × rates → cost / revenue / DB.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  EmployeeCompensationRow,
  EmployeeProjectImpact,
} from '@/types/employees.types'

export interface RealHourlyCostInput {
  hourly_wage?: number | null
  pension_pct?: number | null
  free_choice_pct?: number | null
  vacation_pct?: number | null
  sh_pct?: number | null
  overhead_pct?: number | null
  social_costs?: number | null
}

export function calculateRealHourlyCost(c: RealHourlyCostInput): number {
  const wage = Number(c.hourly_wage ?? 0)
  const totalPct =
    Number(c.pension_pct ?? 0) +
    Number(c.free_choice_pct ?? 0) +
    Number(c.vacation_pct ?? 0) +
    Number(c.sh_pct ?? 0) +
    Number(c.overhead_pct ?? 0)
  const social = Number(c.social_costs ?? 0)
  const real = wage * (1 + totalPct / 100) + social
  return Math.round(real * 100) / 100
}

export interface MarginPreview {
  realCost: number
  salesRate: number
  contributionPerHour: number
  marginPercentage: number   // (sales - cost) / sales × 100; 0 if sales = 0
}

export function calculateMarginPreview(c: RealHourlyCostInput & { sales_rate?: number | null }): MarginPreview {
  const realCost = calculateRealHourlyCost(c)
  const salesRate = Number(c.sales_rate ?? 0)
  const contribution = salesRate - realCost
  const margin = salesRate > 0 ? (contribution / salesRate) * 100 : 0
  return {
    realCost,
    salesRate,
    contributionPerHour: Math.round(contribution * 100) / 100,
    marginPercentage: Math.round(margin * 100) / 100,
  }
}

// =====================================================
// Project impact rollup
// =====================================================

/**
 * Sums an employee's time_logs in an optional date window. If
 * projectId is null, returns the employee's TOTAL impact across all
 * projects in the window. The `projectName` field is filled when we
 * can resolve a single linked project via work_orders.
 *
 * NOTE: time_logs are linked to work_orders, not projects. The current
 * Phase 7 schema does not yet have an explicit work_order ↔ project
 * link beyond `service_cases`. We expose the rollup against
 * work_order_id for now; when projects ↔ work_orders join lands,
 * extend this query.
 */
export async function calculateEmployeeProjectImpact(args: {
  employeeId: string
  workOrderId?: string | null
  sinceIso?: string
  untilIso?: string
}): Promise<EmployeeProjectImpact[]> {
  const supabase = createAdminClient()

  const { data: emp } = await supabase
    .from('employees')
    .select('id, first_name, last_name, name, hourly_rate, cost_rate')
    .eq('id', args.employeeId)
    .maybeSingle()
  if (!emp) return []

  let q = supabase
    .from('time_logs')
    .select('work_order_id, hours, cost_amount, billable, end_time, start_time')
    .eq('employee_id', args.employeeId)
    .not('end_time', 'is', null)

  if (args.workOrderId) q = q.eq('work_order_id', args.workOrderId)
  if (args.sinceIso) q = q.gte('start_time', args.sinceIso)
  if (args.untilIso) q = q.lte('start_time', args.untilIso)

  const { data: logs } = await q
  if (!logs || logs.length === 0) return []

  // Group by work_order_id
  const byWo = new Map<string, { hours: number; billableHours: number; cost: number }>()
  for (const l of logs) {
    const woId = l.work_order_id
    const slot = byWo.get(woId) ?? { hours: 0, billableHours: 0, cost: 0 }
    const h = Number(l.hours) || 0
    const c = Number(l.cost_amount) || 0
    slot.hours += h
    slot.cost += c
    if (l.billable) slot.billableHours += h
    byWo.set(woId, slot)
  }

  const woIds = Array.from(byWo.keys())
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id, title')
    .in('id', woIds)
  const woMap = new Map((workOrders ?? []).map((w) => [w.id, w.title as string]))

  const salesRate = Number(emp.hourly_rate) || 0
  const empName =
    [emp.first_name, emp.last_name].filter(Boolean).join(' ') || (emp as { name?: string }).name || 'Ukendt'

  return Array.from(byWo.entries()).map(([woId, slot]) => {
    const revenue = Math.round(slot.billableHours * salesRate * 100) / 100
    const cost = Math.round(slot.cost * 100) / 100
    return {
      employeeId: emp.id,
      employeeName: empName,
      projectId: woId,
      projectName: woMap.get(woId) ?? null,
      totalHours: round2(slot.hours),
      billableHours: round2(slot.billableHours),
      laborCost: cost,
      laborRevenue: revenue,
      contributionMargin: round2(revenue - cost),
    }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Sums every component of the cost loading on an employee, so the UI
 * can show a "what does this person actually cost us per hour?" panel.
 */
export interface CostBreakdown {
  hourlyWage: number
  pension: number
  freeChoice: number
  vacation: number
  sh: number
  overhead: number
  social: number
  total: number
}

export function buildCostBreakdown(c: EmployeeCompensationRow | RealHourlyCostInput | null): CostBreakdown {
  const wage = Number((c as RealHourlyCostInput | null)?.hourly_wage ?? 0)
  const pen  = Number(c?.pension_pct     ?? 0) / 100 * wage
  const fri  = Number(c?.free_choice_pct ?? 0) / 100 * wage
  const fer  = Number(c?.vacation_pct    ?? 0) / 100 * wage
  const sh   = Number(c?.sh_pct          ?? 0) / 100 * wage
  const ov   = Number(c?.overhead_pct    ?? 0) / 100 * wage
  const soc  = Number(c?.social_costs    ?? 0)
  return {
    hourlyWage: round2(wage),
    pension:    round2(pen),
    freeChoice: round2(fri),
    vacation:   round2(fer),
    sh:         round2(sh),
    overhead:   round2(ov),
    social:     round2(soc),
    total:      round2(wage + pen + fri + fer + sh + ov + soc),
  }
}
