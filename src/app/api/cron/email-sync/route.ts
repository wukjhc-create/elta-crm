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
import { withCronRun } from '@/lib/services/cron-run'

export const dynamic = 'force-dynamic'
// Mail-review 2026-10-09 (#1): op til 1000 mails/postkasse + AI-analyse (budget pr. kørsel i orchestratoren)
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

async function handleCron(request: Request): Promise<Response> {
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

// P1 #9: hver autoriseret koersel registreres i system_health_log (service='cron').
export const GET = withCronRun('email-sync', handleCron)
