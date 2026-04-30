/**
 * Cron Job: System health probes (Phase 6).
 *
 * Runs every 5 minutes. Calls runHealthProbes() for active checks
 * (email sync freshness, bank import recency, economic active flag,
 * AI usage cap, invoice error count) and persists each outcome to
 * system_health_log so the dashboard + alert rules see them.
 *
 * Schedule: see vercel.json — every 5 minutes.
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runHealthProbes, logHealth, getSystemHealth } = await import(
      '@/lib/services/system-health'
    )

    const outcomes = await runHealthProbes()
    for (const o of outcomes) {
      await logHealth(o.service, o.status, o.message, o.metadata)
    }

    // Roll-up snapshot used by dashboards.
    const snapshot = await getSystemHealth()
    await logHealth('health_check', snapshot.overall, `health rollup: ${snapshot.overall}`, {
      services: snapshot.services.map((s) => ({
        service: s.service,
        status: s.status,
        errors: s.errorsLastHour,
        warnings: s.warningsLastHour,
      })),
    })

    return NextResponse.json({ ok: true, overall: snapshot.overall, outcomes, snapshot })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
