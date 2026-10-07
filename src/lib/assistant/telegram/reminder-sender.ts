/**
 * ELTA Assistant / Telegram (T3) — påmindelse som Telegram-besked med knapperne Ring nu · Åbn kunde · Udsæt · Udført.
 * Modtageren er opgavens ansvarlige (assigned_to) via dens Telegram-kobling; uden kobling leveres intet (og
 * påmindelsen markeres ikke sendt). Tidspunktet læses fra CRM af reminders.ts (T4).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DueReminder, ReminderSender } from '@/lib/assistant/reminders'
import type { AssistantButton } from '@/lib/assistant/run-command'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { chatForProfile } from './link'
import { sendTelegram } from './transport'

export function reminderButtons(r: DueReminder): AssistantButton[] {
  if (r.kind === 'personal' || !r.customerId) {
    return [
      { label: '⏳ Udsæt', action: 'p_snooze', ref: r.taskId },
      { label: '✅ Udført', action: 'p_done', ref: r.taskId },
    ]
  }
  return [
    { label: '📞 Ring nu', action: 'call_now', ref: r.customerId },
    { label: '👤 Åbn kunde', action: 'open_customer', ref: r.customerId },
    { label: '⏳ Udsæt', action: 'snooze', ref: r.taskId },
    { label: '✅ Udført', action: 'done', ref: r.taskId },
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
