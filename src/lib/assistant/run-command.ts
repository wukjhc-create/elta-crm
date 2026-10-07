/**
 * ELTA Assistant — udfør én kommando mod CRM (kanal-uafhængig: Telegram-webhooken kalder denne; intet live her).
 *
 * CRM er source of truth: opgaver/påmindelser skrives i customer_tasks (påmindelsen læses fra reminder_at, så en
 * ændring i CRM slår igennem), opslag læses fra customers/service_cases. Alle handlinger audit-logges (T9).
 *
 * Kører med admin-klienten (webhook har ingen browser-session) → rettigheder håndhæves EKSPLICIT her:
 * fase 1 kun kontorroller med customers.edit (admin, serviceleder, salg). Montør afvises, indtil montør-scope kan
 * håndhæves (RLS gælder ikke for admin-klienten).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/auth.types'
import { parseAssistantCommand, type ParsedCommand } from './command-parser'
import { resolveTarget, type TargetCandidate } from './resolve-target'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export type AssistantActor = { profileId: string; role: UserRole; isActive: boolean; channel: 'telegram' | 'test' }

export type AssistantButton = { label: string; action: 'call_now' | 'open_customer' | 'snooze' | 'done' | 'pick'; ref: string }

export type AssistantReply = {
  ok: boolean
  text: string
  buttons?: AssistantButton[]
  /** Oprettet/berørt CRM-række (til test/audit) */
  taskId?: string
}

/** Påmindelse før en tilbageringning (minutter) */
export const CALLBACK_REMINDER_LEAD_MIN = 15
export { ASSISTANT_RULE } from './rules'
import { ASSISTANT_RULE } from './rules'

const fmtWhen = (iso: string) => {
  const p = copenhagenParts(iso)
  const [y, m, d] = p.date.split('-')
  return `${Number(d)}/${Number(m)}${y !== copenhagenParts(new Date()).date.slice(0, 4) ? `-${y}` : ''} kl. ${p.clock}`
}

async function audit(admin: SupabaseClient, actor: AssistantActor, action: string, entityId: string | null, entityName: string | null, metadata: Record<string, unknown>) {
  await admin.from('audit_logs').insert({
    user_id: actor.profileId,
    entity_type: 'assistant',
    entity_id: entityId,
    entity_name: entityName ? entityName.slice(0, 120) : null,
    action: `assistant_${action}`,
    action_description: `ELTA Assistant (${actor.channel}): ${action}`,
    metadata: { channel: actor.channel, ...metadata },
  })
}

function pickButtons(candidates: TargetCandidate[]): AssistantButton[] {
  return candidates.map((c) => ({ label: c.label, action: 'pick', ref: `${c.kind}:${c.id}` }))
}

export async function runAssistantCommand(admin: SupabaseClient, actor: AssistantActor, input: string, now: Date = new Date()): Promise<AssistantReply> {
  if (!actor.isActive) return { ok: false, text: 'Din CRM-bruger er deaktiveret.' }
  if (!hasPermission(actor.role, 'customers.edit')) {
    await audit(admin, actor, 'denied', null, null, { reason: 'role', role: actor.role })
    return { ok: false, text: 'ELTA Assistant er endnu kun åben for kontor-roller.' }
  }

  const cmd: ParsedCommand = parseAssistantCommand(input, now)
  if (!cmd.ok) return { ok: false, text: cmd.reason }

  // Mål (kunde/sag) — påkrævet for alle kommandoer i fase 1 (customer_tasks.customer_id er NOT NULL)
  if (!cmd.target) {
    // Påmindelser uden kunde kan ikke gemmes i CRM endnu (customer_tasks.customer_id NOT NULL — beslutning i designdok)
    return { ok: false, text: 'Påmindelser skal indtil videre knyttes til en kunde eller sag. Skriv fx: "Ring til Hansen fredag kl. 8".' }
  }
  const res = await resolveTarget(admin, cmd.target)
  if (res.status === 'none') return { ok: false, text: `Jeg fandt ingen kunde eller sag for "${cmd.target}".` }
  if (res.status === 'ambiguous') {
    await audit(admin, actor, 'ambiguous', null, cmd.target, { intent: cmd.intent, candidates: res.candidates.map((c) => c.id) })
    return { ok: false, text: `"${cmd.target}" passer på flere — vælg:`, buttons: pickButtons(res.candidates) }
  }
  const target = res.target
  if (!target.customerId) return { ok: false, text: `${target.label} har ingen kunde tilknyttet — opgaven kan ikke oprettes.` }

  if (cmd.intent === 'lookup') {
    if (target.kind === 'case') {
      const { data } = await admin.from('service_cases').select('case_number, title, status, start_date, end_date').eq('id', target.id).single()
      const c = data as { case_number: string; title: string | null; status: string; start_date: string | null; end_date: string | null } | null
      await audit(admin, actor, 'lookup', target.id, target.label, { kind: 'case' })
      return { ok: true, text: c ? `${c.case_number} ${c.title ?? ''}\nStatus: ${c.status}${c.start_date ? `\nStart: ${c.start_date}` : ''}` : target.label, buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId }] }
    }
    const [{ count: openTasks }, { count: openCases }] = await Promise.all([
      admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', target.id).neq('status', 'done'),
      admin.from('service_cases').select('id', { count: 'exact', head: true }).eq('customer_id', target.id).is('closed_at', null),
    ])
    await audit(admin, actor, 'lookup', target.id, target.label, { kind: 'customer' })
    return { ok: true, text: `${target.label}\nÅbne opgaver: ${openTasks ?? 0} · åbne sager: ${openCases ?? 0}`, buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.id }] }
  }

  if (cmd.intent === 'callback' || cmd.intent === 'reminder') {
    const due = cmd.when!.iso!
    const reminderAt = cmd.intent === 'callback' ? new Date(new Date(due).getTime() - CALLBACK_REMINDER_LEAD_MIN * 60_000).toISOString() : due
    const title = cmd.intent === 'callback' ? `Ring til ${target.label}` : (cmd.text ?? 'Påmindelse')
    const { data, error } = await admin.from('customer_tasks').insert({
      customer_id: target.customerId,
      service_case_id: target.kind === 'case' ? target.id : null,
      title: title.slice(0, 200),
      description: `Oprettet via ELTA Assistant: "${input.slice(0, 300)}"`,
      status: 'pending',
      priority: 'normal',
      assigned_to: actor.profileId,
      created_by: actor.profileId,
      due_date: due,
      reminder_at: reminderAt,
      auto_generated: false,
      auto_rule: cmd.intent === 'callback' ? ASSISTANT_RULE.callback : ASSISTANT_RULE.reminder,
    }).select('id').single()
    if (error || !data) return { ok: false, text: 'Opgaven kunne ikke oprettes i CRM.' }
    const taskId = (data as { id: string }).id
    await audit(admin, actor, cmd.intent === 'callback' ? 'callback_created' : 'reminder_created', taskId, title, { target_kind: target.kind, target_id: target.id, due })
    return {
      ok: true,
      taskId,
      text: `${cmd.intent === 'callback' ? '📞' : '⏰'} ${title} — ${fmtWhen(due)} (påmindelse ${fmtWhen(reminderAt)}). Ligger i CRM.`,
      buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId }],
    }
  }

  // note / appointment: afventer afklaring (se docs/design/elta-assistant-telegram.md) — ingen halv implementering
  return { ok: false, text: cmd.intent === 'note' ? 'Noter via assistenten kommer snart.' : 'Aftaler via assistenten kommer snart.' }
}
