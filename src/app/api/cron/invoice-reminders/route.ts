/**
 * Cron Job: Invoice payment reminders (Phase 5.1)
 *
 * Runs daily. For every invoice that is past due (status='sent' and
 * due_date ≤ today − 3 days), picks the next reminder level and calls
 * sendInvoiceReminder() — which itself enforces:
 *   · status must be 'sent'
 *   · 5-day cooldown between reminders
 *   · level 3 escalates to manual_review (no email)
 *
 * Schedule: daily at 09:00 Copenhagen — see vercel.json.
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

    const { getOverdueInvoices, sendInvoiceReminder } = await import(
      '@/lib/services/invoices'
    )
    const { evaluateAndRunAutomations } = await import('@/lib/automation/rule-engine')

    const overdue = await getOverdueInvoices()
    const summary = { checked: overdue.length, sent: 0, manual_review: 0, skipped: 0, failed: 0 }
    const errors: string[] = []

    for (const inv of overdue) {
      // Phase 10 — fire automation rules first; default rule maps to
      // send_reminder. The DB UNIQUE index prevents double-fire even
      // if the cron runs twice for the same overdue invoice.
      try {
        await evaluateAndRunAutomations({
          trigger: 'invoice_overdue',
          entityType: 'invoice',
          entityId: inv.id,
          payload: {
            invoice_id: inv.id,
            invoice_number: inv.invoice_number,
            days_overdue: inv.days_overdue,
            final_amount: inv.final_amount,
          },
        })
      } catch (autoErr) {
        logger.error('autopilot invoice_overdue failed', { entityId: inv.id, error: autoErr })
      }

      try {
        const result = await sendInvoiceReminder(inv.id)
        if (result.status === 'sent') summary.sent++
        else if (result.status === 'manual_review') summary.manual_review++
        else if (result.status === 'skipped') summary.skipped++
        else if (result.status === 'failed') {
          summary.failed++
          if (result.error) errors.push(`${inv.invoice_number}: ${result.error}`)
        }
      } catch (err) {
        summary.failed++
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${inv.invoice_number}: ${msg}`)
        logger.error('invoice reminder threw', { entityId: inv.id, error: err })
      }
    }

    console.log(
      'INVOICE REMINDERS:',
      `checked=${summary.checked}`,
      `sent=${summary.sent}`,
      `manual=${summary.manual_review}`,
      `skipped=${summary.skipped}`,
      `failed=${summary.failed}`
    )

    return NextResponse.json({
      ok: true,
      summary,
      errors: errors.length ? errors : undefined,
    })
  } catch (err) {
    logger.error('invoice-reminders cron failed', {
      error: err instanceof Error ? err : new Error(String(err)),
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
