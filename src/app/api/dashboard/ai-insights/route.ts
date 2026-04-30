/**
 * GET /api/dashboard/ai-insights
 *
 * Returns the dashboard AI panel payload. Auth-gated.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { generateDashboardInsights } = await import('@/lib/ai/dashboard-insights')
    const insights = await generateDashboardInsights()

    return NextResponse.json({ generated_at: new Date().toISOString(), insights })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error', insights: [] },
      { status: 200 }   // never break the dashboard — return empty list with 200
    )
  }
}
