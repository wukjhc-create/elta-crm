/**
 * ELTA Assistant — Telegram-webhook (T10).
 *
 * Slået FRA som standard: uden ASSISTANT_TELEGRAM_ENABLED='true' svarer ruten 404 (ingen live bot i prod uden
 * godkendelse). Telegram sender headeren X-Telegram-Bot-Api-Secret-Token med den hemmelighed, der blev sat ved
 * setWebhook — den sammenlignes timing-safe med env TELEGRAM_WEBHOOK_SECRET (fail-closed hvis den mangler).
 * Svaret er altid 200 til Telegram efter godkendt hemmelighed (ellers gentager Telegram leveringen).
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleTelegramUpdate, telegramSecretOk, type TelegramUpdate } from '@/lib/assistant/telegram/handle-update'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (process.env.ASSISTANT_TELEGRAM_ENABLED !== 'true') return new NextResponse(null, { status: 404 })
  if (!telegramSecretOk(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }
  try {
    const res = await handleTelegramUpdate(createAdminClient(), update)
    return NextResponse.json({ ok: true, handled: res.handled })
  } catch (err) {
    logger.error('assistant telegram webhook failed', { error: err })
    return NextResponse.json({ ok: true })
  }
}
