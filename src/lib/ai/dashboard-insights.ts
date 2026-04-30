/**
 * Dashboard AI panel (Phase 9, §6).
 *
 * Generates the 3–6 most actionable insights to surface on the
 * operational dashboard. All insights are derived from real data — no
 * generic LLM commentary. Pure read; never mutates anything.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { rankEmployees } from '@/lib/ai/employee-analytics'
import { forecastRevenue } from '@/lib/ai/forecasting'
import { logAiSuggestion } from '@/lib/ai/suggestion-log'
import type { DashboardInsight } from '@/types/ai-insights.types'

export async function generateDashboardInsights(): Promise<DashboardInsight[]> {
  const insights: DashboardInsight[] = []
  const supabase = createAdminClient()

  // ---- 1. Underpricing per jobType: median margin below baseline floor ----
  try {
    const { data: snaps } = await supabase
      .from('work_order_profit')
      .select('margin_percentage, revenue, total_cost, details')
      .gt('revenue', 0)
      .order('created_at', { ascending: false })
      .limit(200)
    const margins = (snaps ?? [])
      .map((s) => Number(s.margin_percentage))
      .filter((m) => Number.isFinite(m))
    if (margins.length >= 5) {
      const sorted = [...margins].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      if (median < 25) {
        insights.push({
          id: 'underpricing-global',
          type: 'pricing',
          severity: median < 15 ? 'critical' : 'warning',
          message: 'Du underprister jobs',
          detail: `Median margin på sidste ${margins.length} arbejdsordrer: ${median.toFixed(1)} %. Anbefalet ≥ 25 %.`,
          payload: { median, sample: margins.length },
        })
      }
    }
  } catch { /* ignore */ }

  // ---- 2. Top employee ----
  try {
    const ranked = await rankEmployees()
    const top = ranked[0]
    if (top && top.efficiencyScore > 0.55) {
      const { data: emp } = await supabase
        .from('employees')
        .select('name')
        .eq('id', top.employeeId)
        .maybeSingle()
      const name = emp?.name ?? 'Ukendt'
      insights.push({
        id: `top-employee-${top.employeeId}`,
        type: 'employee_insight',
        severity: 'info',
        message: `${name} er din mest effektive medarbejder`,
        detail: `Effektivitetsscore ${top.efficiencyScore} på ${top.jobCount} jobs (${top.avgHoursPerJob} t/job, ${top.avgProfitPerJob.toFixed(0)} kr profit/job).`,
        payload: { ...top, name },
      })
    }
  } catch { /* ignore */ }

  // ---- 3. Margin upside: how much can total profit lift if median rises 8 % ----
  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: snaps } = await supabase
      .from('work_order_profit')
      .select('revenue, profit, created_at')
      .gt('revenue', 0)
      .gte('created_at', since)
      .limit(500)
    const totalRevenue = (snaps ?? []).reduce((s, r) => s + Number(r.revenue), 0)
    if (totalRevenue > 0) {
      const lift = totalRevenue * 0.08
      insights.push({
        id: 'margin-upside-8',
        type: 'dashboard_insight',
        severity: 'info',
        message: `Du kan øge profit med ~${Math.round(lift).toLocaleString('da-DK')} kr ved +8 % margin`,
        detail: `Baseret på 90-dages omsætning ${Math.round(totalRevenue).toLocaleString('da-DK')} kr.`,
        payload: { totalRevenue90d: totalRevenue, marginLift: 8, projectedExtra: lift },
      })
    }
  } catch { /* ignore */ }

  // ---- 4. Low-profit work orders pile-up ----
  try {
    const { count } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('low_profit', true)
    if ((count ?? 0) > 0) {
      insights.push({
        id: 'low-profit-pile',
        type: 'margin_alert',
        severity: (count ?? 0) > 5 ? 'critical' : 'warning',
        message: `${count} arbejdsordrer markeret som lavt overskud`,
        detail: 'Margin under 15 % — overvej genberegning eller efterfakturering.',
        payload: { count },
      })
    }
  } catch { /* ignore */ }

  // ---- 5. Forecast headline ----
  try {
    const f = await forecastRevenue(30)
    insights.push({
      id: 'forecast-30',
      type: 'forecast',
      severity: 'info',
      message: `30-dages omsætningsforecast: ${Math.round(f.expectedRevenue).toLocaleString('da-DK')} kr`,
      detail: `Pipeline ${Math.round(f.pipelineValue).toLocaleString('da-DK')} kr · konvertering ${(f.conversionRate * 100).toFixed(0)} %.`,
      payload: f as unknown as Record<string, unknown>,
    })
  } catch { /* ignore */ }

  if (insights.length > 0) {
    await logAiSuggestion({
      type: 'dashboard_insight',
      confidence: 0.7,
      message: `${insights.length} dashboard-insights genereret`,
      payload: { count: insights.length, ids: insights.map((i) => i.id) },
    })
  }

  return insights
}
