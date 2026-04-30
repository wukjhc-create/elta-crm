/**
 * Profitability (Phase 8).
 *
 * Read-side wrappers around the SQL functions
 * `calculate_work_order_profit` and `snapshot_work_order_profit`.
 *
 * Snapshots are append-only — every call to snapshotWorkOrderProfit
 * inserts a new row, never overwriting history.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type {
  EmployeeProductivity,
  ProfitSnapshotSource,
  WorkOrderProfit,
  WorkOrderProfitSnapshotRow,
} from '@/types/profitability.types'

/**
 * Pure read — never mutates anything. Returns null if the work order
 * does not exist (logs the underlying error).
 */
export async function calculateWorkOrderProfit(
  workOrderId: string
): Promise<WorkOrderProfit | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('calculate_work_order_profit', {
    p_work_order_id: workOrderId,
  })

  if (error || !data) {
    logger.error('calculateWorkOrderProfit failed', { entityId: workOrderId, error })
    return null
  }
  const d = data as Record<string, unknown>
  return {
    workOrderId: String(d.work_order_id),
    revenue: Number(d.revenue ?? 0),
    laborCost: Number(d.labor_cost ?? 0),
    materialCost: Number(d.material_cost ?? 0),
    totalCost: Number(d.total_cost ?? 0),
    profit: Number(d.profit ?? 0),
    marginPercentage: Number(d.margin_percentage ?? 0),
    revenueSource: (d.revenue_source as 'invoice' | 'planned') ?? 'planned',
    invoiceId: (d.invoice_id as string | null) ?? null,
    timeLogCount: Number(d.time_log_count ?? 0),
    offerLineCount: Number(d.offer_line_count ?? 0),
    totalHours: Number(d.total_hours ?? 0),
  }
}

/**
 * Compute + persist a new snapshot. Triggers fire automatically on
 * invoice insert and on work_order status→done; this is for manual
 * recomputes (admin "Recalculate" button, periodic cron, etc.).
 */
export async function snapshotWorkOrderProfit(
  workOrderId: string,
  source: ProfitSnapshotSource = 'manual'
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('snapshot_work_order_profit', {
    p_work_order_id: workOrderId,
    p_source: source,
  })
  if (error) {
    logger.error('snapshotWorkOrderProfit failed', { entityId: workOrderId, error })
    return null
  }
  const id = String(data)
  console.log('PROFIT SNAPSHOT:', workOrderId, '→', id, `(source=${source})`)
  return id
}

/**
 * Most recent snapshot for a work order (or null if none yet).
 */
export async function getLatestProfitSnapshot(
  workOrderId: string
): Promise<WorkOrderProfitSnapshotRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('work_order_profit')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as WorkOrderProfitSnapshotRow | null) ?? null
}

export async function getProfitHistory(
  workOrderId: string,
  limit = 50
): Promise<WorkOrderProfitSnapshotRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('work_order_profit')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as WorkOrderProfitSnapshotRow[]
}

/**
 * Convenience for the dashboard "log + log" line: calculate + log.
 */
export async function calculateAndLogProfit(workOrderId: string): Promise<WorkOrderProfit | null> {
  const profit = await calculateWorkOrderProfit(workOrderId)
  if (profit) {
    console.log('PROFIT CALCULATED:', workOrderId, profit.profit)
  }
  return profit
}

// =====================================================
// Per-employee productivity
// =====================================================

export async function getEmployeeProductivity(
  employeeId: string,
  options: { sinceIso?: string; untilIso?: string } = {}
): Promise<EmployeeProductivity> {
  const supabase = createAdminClient()
  const since = options.sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const until = options.untilIso ?? new Date().toISOString()

  const { data: emp } = await supabase
    .from('employees')
    .select('id, hourly_rate, cost_rate')
    .eq('id', employeeId)
    .maybeSingle()

  const fallbackHourly = Number(process.env.DEFAULT_HOURLY_RATE ?? 650)
  const fallbackCost = 400

  const { data: logs } = await supabase
    .from('time_logs')
    .select('hours, cost_amount, billable')
    .eq('employee_id', employeeId)
    .gte('start_time', since)
    .lte('start_time', until)
    .not('end_time', 'is', null)

  let hours = 0
  let cost = 0
  let revenue = 0
  for (const l of logs ?? []) {
    const h = Number(l.hours) || 0
    hours += h
    cost += Number(l.cost_amount ?? h * (Number(emp?.cost_rate) || fallbackCost)) || 0
    if (l.billable) {
      revenue += h * (Number(emp?.hourly_rate) || fallbackHourly)
    }
  }
  hours = round2(hours)
  cost = round2(cost)
  revenue = round2(revenue)
  const productivity = cost > 0 ? round2(revenue / cost) : 0

  return { employeeId, hours, cost, revenue, productivity }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
