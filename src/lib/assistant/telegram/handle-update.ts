/**
 * ELTA Assistant / Telegram — behandl én Telegram-update (besked eller knaptryk). Kaldes af webhooken EFTER
 * hemmeligheds-tjek. CRM er source of truth: alle handlinger læser/skriver CRM-tabellerne; rolle og aktiv-status
 * læses ved HVER update; alle kommandoer og handlinger audit-logges (T9).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { hasPermission } from '@/lib/auth/permissions'
import { runAssistantCommand, type AssistantActor, type AssistantButton } from '@/lib/assistant/run-command'
import { ASSISTANT_RULES } from '@/lib/assistant/rules'
import { actorForChat, consumeLinkCode } from './link'
import { sendTelegram } from './transport'
import { transcribeTelegramVoice, voiceEnabled, voiceWithinLimits } from '@/lib/assistant/voice'

/** Telegrams X-Telegram-Bot-Api-Secret-Token mod env TELEGRAM_WEBHOOK_SECRET — timing-safe, fail-closed (min. 16 tegn) */
export function telegramSecretOk(header: string | null, secret: string | undefined = process.env.TELEGRAM_WEBHOOK_SECRET): boolean {
  if (!secret || secret.length < 16 || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}


/** "Udsæt" flytter påmindelsen så mange minutter frem (i CRM) */
export const SNOOZE_MIN = 60

export type TelegramUpdate = {
  update_id?: number
  message?: {
    chat?: { id?: number; type?: string }
    text?: string
    voice?: { file_id?: string; duration?: number; mime_type?: string; file_size?: number }
  }
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number } } }
}

async function audit(admin: SupabaseClient, actor: AssistantActor | null, action: string, entityId: string | null, metadata: Record<string, unknown>) {
  await admin.from('audit_logs').insert({
    user_id: actor?.profileId ?? null,
    entity_type: 'assistant',
    entity_id: entityId,
    action: `assistant_${action}`,
    action_description: `ELTA Assistant (telegram): ${action}`,
    metadata: { channel: 'telegram', ...metadata },
  })
}

const reply = (chatId: number, text: string, buttons?: AssistantButton[]) => sendTelegram({ chatId, text, buttons })

export async function handleTelegramUpdate(admin: SupabaseClient, update: TelegramUpdate, now: Date = new Date()): Promise<{ handled: string }> {
  // ---- knaptryk ----
  if (update.callback_query) {
    const chatId = update.callback_query.message?.chat?.id
    const data = String(update.callback_query.data ?? '')
    if (typeof chatId !== 'number') return { handled: 'ignored' }
    const actor = await actorForChat(admin, chatId)
    if (!actor || !actor.isActive || !hasPermission(actor.role, 'customers.edit')) {
      await audit(admin, actor, 'button_denied', null, { reason: actor ? 'role_or_inactive' : 'unlinked' })
      await reply(chatId, !actor ? 'Denne chat er ikke forbundet. Forbind din CRM-bruger under Indstillinger → Profil.' : !actor.isActive ? 'Din CRM-bruger er deaktiveret.' : 'ELTA Assistant er endnu kun åben for kontor-roller.')
      return { handled: 'denied' }
    }
    const m = data.match(/^(done|snooze|call_now|p_done|p_snooze):([0-9a-f-]{36})$/)
    if (!m) return { handled: 'ignored' }
    const [, action, ref] = m
    if (action === 'p_done' || action === 'p_snooze') {
      // personlig påmindelse: KUN ejeren (også admin afvises — privat huskeliste)
      const { data: pr } = await admin.from('personal_reminders').select('id, title, owner_id, status').eq('id', ref).maybeSingle()
      const rem = pr as { id: string; title: string; owner_id: string; status: string } | null
      if (!rem || rem.owner_id !== actor.profileId) {
        await audit(admin, actor, 'button_denied', ref, { reason: 'not_owner', action })
        await reply(chatId, 'Påmindelsen findes ikke eller er ikke din.')
        return { handled: 'denied' }
      }
      if (action === 'p_done') {
        await admin.from('personal_reminders').update({ status: 'done', completed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', ref).eq('owner_id', actor.profileId)
        await audit(admin, actor, 'personal_reminder_done', ref, {})
        await reply(chatId, `✅ Udført: ${rem.title}`)
        return { handled: 'p_done' }
      }
      const nextAt = new Date(now.getTime() + SNOOZE_MIN * 60_000).toISOString()
      await admin.from('personal_reminders').update({ reminder_at: nextAt, updated_at: now.toISOString() }).eq('id', ref).eq('owner_id', actor.profileId)
      await audit(admin, actor, 'personal_reminder_snoozed', ref, { reminder_at: nextAt })
      await reply(chatId, `⏳ Udsat ${SNOOZE_MIN} min: ${rem.title}`)
      return { handled: 'p_snooze' }
    }
    if (action === 'call_now') {
      const { data: c } = await admin.from('customers').select('company_name, contact_person, phone, mobile').eq('id', ref).maybeSingle()
      const cu = c as { company_name: string | null; contact_person: string | null; phone: string | null; mobile: string | null } | null
      await audit(admin, actor, 'call_now', ref, {})
      const num = cu?.mobile || cu?.phone
      await reply(chatId, cu ? `📞 ${cu.company_name || cu.contact_person}: ${num ?? 'intet telefonnummer i CRM'}` : 'Kunden findes ikke.')
      return { handled: 'call_now' }
    }
    // done / snooze: kun assistent-opgaver, og kun egne (admin/serviceleder må alle)
    const { data: t } = await admin.from('customer_tasks').select('id, title, assigned_to, auto_rule, status').eq('id', ref).maybeSingle()
    const task = t as { id: string; title: string; assigned_to: string | null; auto_rule: string | null; status: string } | null
    const mayAct = !!task && ASSISTANT_RULES.includes(task.auto_rule ?? '') && (task.assigned_to === actor.profileId || ['admin', 'serviceleder'].includes(actor.role))
    if (!mayAct) {
      await audit(admin, actor, 'button_denied', ref, { reason: 'not_own_task', action })
      await reply(chatId, 'Opgaven findes ikke eller er ikke din.')
      return { handled: 'denied' }
    }
    if (action === 'done') {
      await admin.from('customer_tasks').update({ status: 'done', completed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', ref)
      await audit(admin, actor, 'task_done', ref, {})
      await reply(chatId, `✅ Udført: ${task!.title}`)
      return { handled: 'done' }
    }
    const next = new Date(now.getTime() + SNOOZE_MIN * 60_000).toISOString()
    await admin.from('customer_tasks').update({ reminder_at: next, updated_at: now.toISOString() }).eq('id', ref)
    await audit(admin, actor, 'task_snoozed', ref, { reminder_at: next })
    await reply(chatId, `⏳ Udsat ${SNOOZE_MIN} min: ${task!.title}`)
    return { handled: 'snooze' }
  }

  // ---- talebesked (T11) → transskription → samme kommandomotor ----
  const voice = update.message?.voice
  if (voice?.file_id && typeof update.message?.chat?.id === 'number') {
    const vChat = update.message.chat.id
    if (update.message.chat.type && update.message.chat.type !== 'private') {
      await reply(vChat, 'ELTA Assistant virker kun i private chats.')
      return { handled: 'not_private' }
    }
    // Bruger først: ukendte/deaktiverede chats transskriberes aldrig (ingen omkostning, intet gemt)
    const vActor = await actorForChat(admin, vChat)
    if (!vActor) {
      await audit(admin, null, 'unlinked_message', null, { kind: 'voice' })
      await reply(vChat, 'Denne chat er ikke forbundet. Forbind din CRM-bruger under Indstillinger → Profil → "Forbind Telegram".')
      return { handled: 'unlinked' }
    }
    // Assistent-review 2026-10-08 (#6): deaktiverede brugere og roller uden assistent-adgang transskriberes aldrig
    if (!vActor.isActive || !hasPermission(vActor.role, 'customers.edit')) {
      await audit(admin, vActor, 'voice_rejected', null, { reason: vActor.isActive ? 'role' : 'inactive' })
      await reply(vChat, !vActor.isActive ? 'Din CRM-bruger er deaktiveret.' : 'ELTA Assistant er endnu kun åben for kontor-roller.')
      return { handled: 'voice_rejected' }
    }
    if (!voiceEnabled()) {
      await reply(vChat, 'Talebeskeder er ikke slået til endnu — skriv kommandoen som tekst.')
      return { handled: 'voice_disabled' }
    }
    const lim = voiceWithinLimits(voice)
    if (!lim.ok) {
      await audit(admin, vActor, 'voice_rejected', null, { reason: lim.reason, duration: voice.duration ?? null })
      await reply(vChat, `Talebeskeden er for lang — højst 60 sekunder. Del den op eller skriv den.`)
      return { handled: 'voice_rejected' }
    }
    const tr = await transcribeTelegramVoice({ file_id: voice.file_id, duration: voice.duration, mime_type: voice.mime_type })
    await audit(admin, vActor, tr.ok ? 'voice_transcribed' : 'voice_failed', null, tr.ok ? { duration: voice.duration ?? null, length: tr.text.length } : { reason: tr.reason })
    if (!tr.ok) {
      await reply(vChat, tr.reason === 'budget' ? 'Dagens AI-kvote er brugt — skriv kommandoen som tekst.' : 'Jeg kunne ikke høre beskeden — prøv igen eller skriv den.')
      return { handled: 'voice_failed' }
    }
    const vr = await runAssistantCommand(admin, vActor, tr.text, now)
    // Transskriptionen vises altid, så en fejlhørt kommando ses med det samme
    await reply(vChat, `🎙️ «${tr.text}»\n\n${vr.text}`, vr.buttons)
    return { handled: vr.ok ? 'voice_command_ok' : 'voice_command_rejected' }
  }

  // ---- tekstbesked ----
  const chatId = update.message?.chat?.id
  const text = String(update.message?.text ?? '').trim()
  if (typeof chatId !== 'number' || !text) return { handled: 'ignored' }
  if (update.message?.chat?.type && update.message.chat.type !== 'private') {
    await reply(chatId, 'ELTA Assistant virker kun i private chats.')
    return { handled: 'not_private' }
  }

  const start = text.match(/^\/start(?:\s+([A-Za-z0-9]{6,12}))?$/)
  if (start) {
    if (!start[1]) {
      await reply(chatId, 'Hej! Forbind din CRM-bruger: Indstillinger → Profil → "Forbind Telegram", og send så /start <kode>.')
      return { handled: 'start_help' }
    }
    const res = await consumeLinkCode(admin, chatId, start[1], now)
    const actor = res.ok ? await actorForChat(admin, chatId) : null
    await audit(admin, actor, res.ok ? 'linked' : 'link_failed', null, res.ok ? {} : { reason: res.reason })
    const msg = res.ok
      ? '✅ Din Telegram er forbundet til ELTA CRM. Prøv fx: "Ring til Hansen i morgen kl. 10".'
      : res.reason === 'expired' ? 'Koden er udløbet — lav en ny i CRM.' : res.reason === 'inactive' ? 'Din CRM-bruger er deaktiveret.' : res.reason === 'chat_in_use' ? 'Denne chat er allerede forbundet til en anden bruger.' : 'Ugyldig kode.'
    await reply(chatId, msg)
    return { handled: res.ok ? 'linked' : 'link_failed' }
  }

  const actor = await actorForChat(admin, chatId)
  if (!actor) {
    await audit(admin, null, 'unlinked_message', null, {}) // ingen beskedtekst gemmes fra ukendte chats
    await reply(chatId, 'Denne chat er ikke forbundet. Forbind din CRM-bruger under Indstillinger → Profil → "Forbind Telegram".')
    return { handled: 'unlinked' }
  }
  await audit(admin, actor, 'command_received', null, { length: text.length })
  const r = await runAssistantCommand(admin, actor, text, now)
  await reply(chatId, r.text, r.buttons)
  return { handled: r.ok ? 'command_ok' : 'command_rejected' }
}
