/**
 * ELTA Assistant / Telegram — udgående beskeder. Token kun fra env TELEGRAM_BOT_TOKEN (secret, printes aldrig).
 * Transporten kan udskiftes (tests fanger beskederne; intet live). Uden token sendes intet.
 */
import type { AssistantButton } from '@/lib/assistant/run-command'
import { APP_URL } from '@/lib/constants'

export type OutboundMessage = { chatId: number; text: string; buttons?: AssistantButton[] }
export type TelegramTransport = (msg: OutboundMessage) => Promise<{ delivered: boolean; detail?: string }>

/** Callback-data (≤ 64 bytes i Telegram): "<handling>:<uuid>" */
export function encodeCallback(action: AssistantButton['action'], ref: string): string {
  return `${action}:${ref}`.slice(0, 64)
}

export function inlineKeyboard(buttons: AssistantButton[] | undefined) {
  if (!buttons?.length) return undefined
  const base = APP_URL.replace(/\/$/, '')
  return {
    inline_keyboard: buttons.map((b) => [
      b.action === 'open_customer'
        ? { text: b.label, url: `${base}/dashboard/customers/${b.ref}` }
        : { text: b.label, callback_data: encodeCallback(b.action, b.ref) },
    ]),
  }
}

const liveTransport: TelegramTransport = async (msg) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { delivered: false, detail: 'TELEGRAM_BOT_TOKEN mangler' }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: msg.chatId, text: msg.text, reply_markup: inlineKeyboard(msg.buttons), disable_web_page_preview: true }),
  })
  return { delivered: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` }
}

let transport: TelegramTransport = liveTransport

export function setTelegramTransport(t: TelegramTransport | null): void {
  transport = t ?? liveTransport
}

export function sendTelegram(msg: OutboundMessage) {
  return transport(msg)
}
