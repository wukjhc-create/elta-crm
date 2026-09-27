/**
 * Cron Job: Daglig e-conomic eksportfejl-notifikation (Sprint Ø6.5)
 *
 * Læser company_settings.export_error_notification_config og beslutter via
 * decideErrorNotification() (anti-spam/dedup) om der skal sendes en SAMLET
 * daglig opsummering til bogholderiet. Sender kun ved åbne fejl + når dedup
 * tillader det. Ingen spam, ingen secrets.
 *
 * Schedule: dagligt — se vercel.json.
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'
import { withCronRun } from '@/lib/services/cron-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

async function handleCron(request: Request): Promise<Response> {
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

    const { sendExportErrorNotification } = await import('@/lib/services/export-error-notification')
    const result = await sendExportErrorNotification({ trigger: 'cron' })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('export-error-notification cron failed', {
      error: err instanceof Error ? err : new Error(String(err)),
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// P1 #9: hver autoriseret koersel registreres i system_health_log (service='cron').
export const GET = withCronRun('export-error-notification', handleCron)
