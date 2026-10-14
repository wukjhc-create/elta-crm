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
import { withCronRun } from '@/lib/services/cron-run'

import { reminderRunExhausted, orderRemindersFailedLast } from '@/lib/invoices/reminder-limits'
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

    const { getOverdueInvoices, sendInvoiceReminder } = await import(
      '@/lib/services/invoices'
    )
    const { evaluateAndRunAutomations } = await import('@/lib/automation/rule-engine')

    // F-10: fakturaer hvis rykker fejlede inden for 3 døgn tages sidst — de må ikke blokere de øvrige
    const overdueRaw = await getOverdueInvoices()
    const recentlyFailed = new Set<string>()
    {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const since = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
      const ids = overdueRaw.map((i) => i.id)
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await createAdminClient().from('invoice_reminder_log').select('invoice_id')
          .in('invoice_id', ids.slice(i, i + 200)).eq('status', 'failed').gte('created_at', since)
        for (const r of (data ?? []) as Array<{ invoice_id: string }>) recentlyFailed.add(r.invoice_id)
      }
    }
    const overdue = orderRemindersFailedLast(overdueRaw, recentlyFailed)
    const summary = { checked: overdue.length, sent: 0, manual_review: 0, skipped: 0, failed: 0 }
    const errors: string[] = []

    const startedAt = Date.now()
    let mailsThisRun = 0
    const exhausted = () => reminderRunExhausted({ sent: mailsThisRun, elapsedMs: Date.now() - startedAt })
    for (const inv of overdue) {
      // Mail-review 2026-10-08 (#1): højst MAX_REMINDER_MAILS_PER_RUN afsendelser pr. kørsel (maxDuration 60 s, en
      // Graph-afsendelse kan tage op til 30 s) — resten tages ved næste kørsel i stedet for at blive dræbt midt i en send.
      // F-10: kun SENDTE tæller i loftet; tidsbudgettet stopper kørslen ved hængende afsendelser
      if (exhausted()) { summary.skipped++; continue }
      // Phase 10 — fire automation rules first; default rule maps to
      // send_reminder. The DB UNIQUE index prevents double-fire even
      // if the cron runs twice for the same overdue invoice.
      try {
        const auto = await evaluateAndRunAutomations({
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
        // Assistent-review 2026-10-08 (#2): regelmotorens send_reminder sender også — tælles med i loftet pr. kørsel
        mailsThisRun += auto.executions.filter((e) => /^reminder sent/.test(e.message ?? '')).length
      } catch (autoErr) {
        logger.error('autopilot invoice_overdue failed', { entityId: inv.id, error: autoErr })
      }
      if (exhausted()) { summary.skipped++; continue }

      try {
        const result = await sendInvoiceReminder(inv.id)
        if (result.status === 'sent') mailsThisRun++
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

// P1 #9: hver autoriseret koersel registreres i system_health_log (service='cron').
export const GET = withCronRun('invoice-reminders', handleCron)
