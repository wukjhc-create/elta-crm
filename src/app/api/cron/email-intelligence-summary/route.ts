/**
 * Cron: Daily Email Intelligence Summary
 *
 * Aggregates yesterday's email_intelligence_logs and upserts a row into
 * email_intelligence_daily_summary. Runs at 00:30 UTC.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { runDailyEmailIntelligenceSummary } from '@/lib/services/email-intelligence-summary'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Summarize the previous UTC day
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const summary = await runDailyEmailIntelligenceSummary(yesterday)

    return NextResponse.json({
      message: 'Daily summary stored',
      summary,
    })
  } catch (error) {
    logger.error('email-intelligence-summary cron failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
