/**
 * GET /api/dashboard/ai-insights
 *
 * Returns the dashboard AI panel payload. Auth-gated.
 * D48/D50 (privacy): indsigterne bygger på margin/DB, omsætning og profit pr. medarbejder (admin-klient, uden RLS) →
 * kun economy.cost_prices; medarbejder-indsigter (profit/effektivitet pr. person) kun med employees.payroll.view.
 * Øvrige roller får en tom liste (200 — dashboardet må aldrig knække).
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    let ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
    try {
      ctx = await getAuthenticatedClientWithRole()
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ctx.hasPermission('economy.cost_prices')) {
      return NextResponse.json({ generated_at: new Date().toISOString(), insights: [] })
    }

    const { generateDashboardInsights } = await import('@/lib/ai/dashboard-insights')
    const all = await generateDashboardInsights()
    const insights = ctx.hasPermission('employees.payroll.view')
      ? all
      : all.filter((i) => (i as { type?: string }).type !== 'employee_insight')

    return NextResponse.json({ generated_at: new Date().toISOString(), insights })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error', insights: [] },
      { status: 200 }   // never break the dashboard — return empty list with 200
    )
  }
}
