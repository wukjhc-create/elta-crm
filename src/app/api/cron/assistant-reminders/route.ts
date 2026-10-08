/**
 * Cron: ELTA Assistant-påmindelser via Telegram (T3/T4).
 *
 * IKKE planlagt i vercel.json (aktivering kræver godkendelse) og slået fra uden ASSISTANT_TELEGRAM_ENABLED='true'.
 * Læser forfaldne påmindelser fra customer_tasks.reminder_at (CRM = source of truth) og sender til den ansvarliges
 * forbundne Telegram-chat. Kræver CRON_SECRET (timing-safe), som de øvrige crons.
 */
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchAssistantReminders } from '@/lib/assistant/reminders'
import { telegramReminderSender } from '@/lib/assistant/telegram/reminder-sender'
import { withCronRun } from '@/lib/services/cron-run'

export const dynamic = 'force-dynamic'

async function handleCron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const expected = `Bearer ${secret}`
  if (!secret || !auth || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (process.env.ASSISTANT_TELEGRAM_ENABLED !== 'true') {
    return NextResponse.json({ success: true, skipped: 'ASSISTANT_TELEGRAM_ENABLED er ikke slået til' })
  }
  const admin = createAdminClient()
  const result = await dispatchAssistantReminders(admin, telegramReminderSender(admin))
  return NextResponse.json({ success: true, ...result })
}

export const GET = withCronRun('assistant-reminders', handleCron)
