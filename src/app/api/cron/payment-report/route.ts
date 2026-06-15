/**
 * Cron Job: Betalingsrapport-mail til bogholderiet (Sprint Ø5.0)
 *
 * Læser company_settings.payment_report_config. Sprint Ø5.1: cronen kører
 * DAGLIGT og beslutter selv via shouldSendReportToday() ud fra frekvens
 * (ugentlig / hver 14. dag / månedlig) + valgt ugedag — én robust route,
 * ingen ekstra Vercel cron-entries. Hvis dagen matcher: bygger listen fra
 * SQL-viewet (Ø4.9), vedhæfter CSV (Ø4.8) og sender via Graph-mail. Skip
 * hvis 0 rækker (skip_if_empty) — ingen spam.
 *
 * Schedule: dagligt 07:30 Copenhagen — se vercel.json.
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

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

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { parsePaymentReportConfig, shouldSendReportToday } = await import(
      '@/lib/invoices/payment-report-config'
    )
    const { sendPaymentReport } = await import('@/lib/services/payment-report')

    const supabase = createAdminClient()
    const { data: row } = await supabase
      .from('company_settings')
      .select('payment_report_config')
      .maybeSingle()
    const config = parsePaymentReportConfig(row?.payment_report_config)

    if (!config.enabled) {
      return NextResponse.json({ ok: true, status: 'disabled' })
    }

    // Sprint Ø5.1 — cron kører dagligt; afgør ud fra frekvens/ugedag.
    if (!shouldSendReportToday(config, new Date())) {
      return NextResponse.json({ ok: true, status: 'not_scheduled_today' })
    }

    const result = await sendPaymentReport({
      trigger: 'cron',
      recipients: config.recipients,
      filter: config.filter,
      skipIfEmpty: config.skip_if_empty,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('payment-report cron failed', {
      error: err instanceof Error ? err : new Error(String(err)),
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
