/**
 * Employee performance analytics (Phase 9, §4).
 *
 * Pulls completed work orders the employee logged time on, joins to
 * the latest profit snapshot, and computes:
 *   - average hours per job
 *   - average profit per job
 *   - efficiency score: profit-per-hour, normalised against the median
 *     of the same metric across all active employees (0–1).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logAiSuggestion } from '@/lib/ai/suggestion-log'
import type { EmployeePerformance } from '@/types/ai-insights.types'

interface EmployeeRollup {
  employeeId: string
  jobs: number
  totalHours: number
  totalProfit: number
}

async function rollupAllEmployees(): Promise<EmployeeRollup[]> {
  const supabase = createAdminClient()
  // Latest profit per work order (most recent snapshot).
  const { data: snaps } = await supabase
    .from('work_order_profit')
    .select('work_order_id, profit, revenue, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)

  const latestByWo = new Map<string, number>()
  for (const s of snaps ?? []) {
    if (!latestByWo.has(s.work_order_id)) {
      latestByWo.set(s.work_order_id, Number(s.profit) || 0)
    }
  }
  if (latestByWo.size === 0) return []

  const woIds = Array.from(latestByWo.keys())
  const { data: logs } = await supabase
    .from('time_logs')
    .select('employee_id, work_order_id, hours, billable, end_time')
    .in('work_order_id', woIds)
    .not('end_time', 'is', null)

  // Sum hours per (employee, work_order); split profit proportionally
  // across the employees that worked on each job.
  const hoursPerWo = new Map<string, number>()
  const hoursPerEmpWo = new Map<string, Map<string, number>>()
  for (const l of logs ?? []) {
    const h = Number(l.hours) || 0
    if (h <= 0) continue
    hoursPerWo.set(l.work_order_id, (hoursPerWo.get(l.work_order_id) ?? 0) + h)
    const slot = hoursPerEmpWo.get(l.employee_id) ?? new Map<string, number>()
    slot.set(l.work_order_id, (slot.get(l.work_order_id) ?? 0) + h)
    hoursPerEmpWo.set(l.employee_id, slot)
  }

  const out: EmployeeRollup[] = []
  for (const [empId, jobMap] of hoursPerEmpWo) {
    let totalHours = 0
    let totalProfit = 0
    for (const [woId, h] of jobMap) {
      totalHours += h
      const woTotal = hoursPerWo.get(woId) || h
      const woProfit = latestByWo.get(woId) || 0
      totalProfit += woProfit * (h / woTotal)
    }
    out.push({
      employeeId: empId,
      jobs: jobMap.size,
      totalHours: round2(totalHours),
      totalProfit: round2(totalProfit),
    })
  }
  return out
}

export async function analyzeEmployeePerformance(employeeId: string): Promise<EmployeePerformance | null> {
  const all = await rollupAllEmployees()
  const me = all.find((e) => e.employeeId === employeeId)
  if (!me || me.jobs === 0) return null

  const profitPerHour = me.totalHours > 0 ? me.totalProfit / me.totalHours : 0
  const peerProfitPerHour = all
    .filter((e) => e.totalHours > 0)
    .map((e) => e.totalProfit / e.totalHours)
    .sort((a, b) => a - b)
  const median = peerProfitPerHour.length
    ? peerProfitPerHour[Math.floor(peerProfitPerHour.length / 2)]
    : 0
  // Efficiency 0–1: 1.0 means employee matches/exceeds 2× median.
  const efficiency =
    median > 0 ? Math.min(1, Math.max(0, profitPerHour / (2 * median))) : 0.5

  const result: EmployeePerformance = {
    employeeId,
    jobCount: me.jobs,
    avgHoursPerJob: round2(me.totalHours / me.jobs),
    avgProfitPerJob: round2(me.totalProfit / me.jobs),
    efficiencyScore: round3(efficiency),
  }

  await logAiSuggestion({
    type: 'employee_insight',
    entityType: 'employee',
    entityId: employeeId,
    confidence: Math.min(0.9, 0.4 + me.jobs * 0.05),
    message: `Effektivitetsscore ${result.efficiencyScore} (${me.jobs} jobs, ${me.totalHours} t)`,
    payload: result as unknown as Record<string, unknown>,
  })

  return result
}

export async function rankEmployees(): Promise<EmployeePerformance[]> {
  const rollups = await rollupAllEmployees()
  if (rollups.length === 0) return []
  const profitPerHour = rollups
    .filter((e) => e.totalHours > 0)
    .map((e) => e.totalProfit / e.totalHours)
    .sort((a, b) => a - b)
  const median = profitPerHour.length
    ? profitPerHour[Math.floor(profitPerHour.length / 2)]
    : 0
  return rollups
    .map((r) => {
      const pph = r.totalHours > 0 ? r.totalProfit / r.totalHours : 0
      const eff = median > 0 ? Math.min(1, Math.max(0, pph / (2 * median))) : 0.5
      return {
        employeeId: r.employeeId,
        jobCount: r.jobs,
        avgHoursPerJob: round2(r.totalHours / Math.max(1, r.jobs)),
        avgProfitPerJob: round2(r.totalProfit / Math.max(1, r.jobs)),
        efficiencyScore: round3(eff),
      }
    })
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }
