/**
 * ELTA Assistant / Telegram (T3) — påmindelse som Telegram-besked med knapperne Ring nu · Åbn kunde · Udsæt · Udført.
 * Modtageren er opgavens ansvarlige (assigned_to) via dens Telegram-kobling; uden kobling leveres intet (og
 * påmindelsen markeres ikke sendt). Tidspunktet læses fra CRM af reminders.ts (T4).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DueReminder, ReminderSender } from '@/lib/assistant/reminders'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { chatForProfile } from './link'
import { sendTelegram } from './transport'

export function reminderButtons(r: DueReminder) {
  return [
    { label: '📞 Ring nu', action: 'call_now' as const, ref: r.customerId },
    { label: '👤 Åbn kunde', action: 'open_customer' as const, ref: r.customerId },
    { label: '⏳ Udsæt', action: 'snooze' as const, ref: r.taskId },
    { label: '✅ Udført', action: 'done' as const, ref: r.taskId },
  ]
}

export function telegramReminderSender(admin: SupabaseClient): ReminderSender {
  return async (r) => {
    if (!r.assignedTo) return { delivered: false, channel: 'telegram', detail: 'ingen ansvarlig' }
    const chatId = await chatForProfile(admin, r.assignedTo)
    if (chatId == null) return { delivered: false, channel: 'telegram', detail: 'ikke forbundet' }
    // brugeren skal stadig være aktiv
    const { data: p } = await admin.from('profiles').select('is_active').eq('id', r.assignedTo).maybeSingle()
    if (!(p as { is_active?: boolean } | null)?.is_active) return { delivered: false, channel: 'telegram', detail: 'bruger deaktiveret' }
    const when = r.dueDate ? copenhagenParts(r.dueDate).clock : null
    const res = await sendTelegram({ chatId, text: `⏰ ${r.title}${when ? ` kl. ${when}` : ''}`, buttons: reminderButtons(r) })
    return { delivered: res.delivered, channel: 'telegram', detail: res.detail }
  }
}
