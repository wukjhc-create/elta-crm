/**
 * Cron Job: Email Sync (Mail Bridge)
 *
 * Polls Microsoft Graph API for new emails in the CRM mailbox,
 * auto-links to customers, and detects AO product references.
 *
 * Schedule: Every 5 minutes (configurable in vercel.json)
 * Auth: Bearer token via CRON_SECRET env var
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // Verify cron secret — fail-secure when not configured
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

    // Dynamic import to keep cold start fast
    const { runEmailSync } = await import('@/lib/services/email-sync-orchestrator')

    const result = await runEmailSync()

    logger.info('Email sync cron completed', {
      metadata: {
        success: result.success,
        inserted: result.emailsInserted,
        linked: result.emailsLinked,
        aoMatches: result.aoMatchesFound,
        durationMs: result.durationMs,
      },
    })

    return NextResponse.json({
      message: 'Email sync completed',
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (error) {
    logger.error('Email sync cron error', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
