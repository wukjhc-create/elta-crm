/**
 * Cron Job: Auto-match unmatched bank transactions to invoices.
 *
 * Schedule: daily 06:30 Copenhagen — see vercel.json.
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

    const { autoMatchTransactions } = await import('@/lib/services/bank-payments')
    const summary = await autoMatchTransactions()

    console.log(
      'BANK MATCH CRON:',
      `scanned=${summary.scanned}`,
      `matched=${summary.matched}`,
      `partial=${summary.partial}`,
      `over=${summary.overpayment}`,
      `ambig=${summary.ambiguous}`,
      `unmatched=${summary.unmatched}`
    )

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    logger.error('bank-match cron failed', {
      error: err instanceof Error ? err : new Error(String(err)),
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
