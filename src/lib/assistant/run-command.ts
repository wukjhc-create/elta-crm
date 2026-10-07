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
import { resolveTarget } from './resolve-target'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export type AssistantActor = { profileId: string; role: UserRole; isActive: boolean; channel: 'telegram' | 'test' }

/** p_snooze/p_done = personlig påmindelse (personal_reminders), øvrige = kundeopgave/kunde */
export type AssistantButton = { label: string; action: 'call_now' | 'open_customer' | 'snooze' | 'done' | 'p_snooze' | 'p_done'; ref: string }

export type AssistantReply = {
  ok: boolean
  text: string
  buttons?: AssistantButton[]
  /** Oprettet/berørt CRM-række (til test/audit) */
  taskId?: string
}

/** Påmindelse før en tilbageringning (minutter) */
export const CALLBACK_REMINDER_LEAD_MIN = 15
/** Påmindelse før en aftale/besigtigelse (minutter) */
export const APPOINTMENT_REMINDER_LEAD_MIN = 60
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
    if (cmd.intent !== 'reminder') return { ok: false, text: 'Hvilken kunde eller sag drejer det sig om?' }
    // "Mind mig om …" uden kunde → personlig påmindelse (personal_reminders, 00197) — samme model som CRM'ets
    // "Mine påmindelser"; kun ejeren ser den. Tidspunktet ændres i CRM og følges af påmindelsen.
    const due = cmd.when!.iso!
    const title = (cmd.text ?? 'Påmindelse').slice(0, 200)
    const { data, error } = await admin.from('personal_reminders').insert({
      owner_id: actor.profileId,
      title,
      notes: `Oprettet via ELTA Assistant: "${input.slice(0, 300)}"`,
      due_at: due,
      reminder_at: due,
      source: actor.channel === 'telegram' ? 'telegram' : 'assistant',
    }).select('id').single()
    if (error || !data) return { ok: false, text: 'Påmindelsen kunne ikke gemmes i CRM.' }
    const id = (data as { id: string }).id
    await audit(admin, actor, 'personal_reminder_created', id, title, { due })
    return { ok: true, taskId: id, text: `⏰ ${title} — ${fmtWhen(due)}. Ligger under "Mine påmindelser" i CRM.` }
  }
  const res = await resolveTarget(admin, cmd.target)
  if (res.status === 'none') return { ok: false, text: `Jeg fandt ingen kunde eller sag for "${cmd.target}".` }
  if (res.status === 'ambiguous') {
    await audit(admin, actor, 'ambiguous', null, cmd.target, { intent: cmd.intent, candidates: res.candidates.map((c) => c.id) })
    // Ingen skjult samtale-tilstand uden for CRM: kandidaterne vises med kundenr./sagsnr., og brugeren gentager
    // kommandoen med det entydige nummer (som resolveTarget matcher præcist)
    return { ok: false, text: `"${cmd.target}" passer på flere — skriv kommandoen igen med kundenummer/sagsnummer:\n${res.candidates.map((c) => `• ${c.label}`).join('\n')}` }
  }
  const target = res.target
  // kunde kræves for opgaver/aftaler/opslag (nedenfor bruges target.customerId! i de grene); noter på en sag uden kunde er tilladt
  if (!target.customerId && !(cmd.intent === 'note' && target.kind === 'case')) return { ok: false, text: `${target.label} har ingen kunde tilknyttet — opgaven kan ikke oprettes.` }

  if (cmd.intent === 'lookup') {
    if (target.kind === 'case') {
      const { data } = await admin.from('service_cases').select('case_number, title, status, start_date, end_date').eq('id', target.id).single()
      const c = data as { case_number: string; title: string | null; status: string; start_date: string | null; end_date: string | null } | null
      await audit(admin, actor, 'lookup', target.id, target.label, { kind: 'case' })
      return { ok: true, text: c ? `${c.case_number} ${c.title ?? ''}\nStatus: ${c.status}${c.start_date ? `\nStart: ${c.start_date}` : ''}` : target.label, buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId! }] }
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
      buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId! }],
    }
  }

  if (cmd.intent === 'appointment') {
    // T5: aftalen oprettes som CRM-opgave (vises i kalenderen, påmindelse 1 time før). Kundens bekræftelsesmail sendes
    // IKKE herfra (live kundemail er gated) — sendes fra CRM af en medarbejder.
    const due = cmd.when!.iso!
    const kind = cmd.text === 'besigtigelse' ? 'Besigtigelse' : cmd.text === 'møde' ? 'Møde' : 'Aftale'
    const title = `${kind}: ${target.label}`
    const reminderAt = new Date(new Date(due).getTime() - APPOINTMENT_REMINDER_LEAD_MIN * 60_000).toISOString()
    const { data, error } = await admin.from('customer_tasks').insert({
      customer_id: target.customerId,
      service_case_id: target.kind === 'case' ? target.id : null,
      title: title.slice(0, 200),
      description: `Oprettet via ELTA Assistant: "${input.slice(0, 300)}"
Bekræftelse til kunden er IKKE sendt — send fra CRM.`,
      status: 'pending',
      priority: 'normal',
      assigned_to: actor.profileId,
      created_by: actor.profileId,
      due_date: due,
      reminder_at: reminderAt,
      auto_generated: false,
      auto_rule: ASSISTANT_RULE.appointment,
    }).select('id').single()
    if (error || !data) return { ok: false, text: 'Aftalen kunne ikke oprettes i CRM.' }
    const taskId = (data as { id: string }).id
    await audit(admin, actor, 'appointment_created', taskId, title, { target_kind: target.kind, target_id: target.id, due, kind })
    return {
      ok: true,
      taskId,
      text: `📅 ${title} — ${fmtWhen(due)}. Ligger i CRM-kalenderen. Bekræftelse til kunden er ikke sendt.`,
      buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId! }],
    }
  }

  // note (T6): separate tidsstemplede noter — sag: case_notes (eksisterende model), kunde: customer_notes.
  // customers.notes overskrives ALDRIG.
  const body = (cmd.text ?? '').trim().slice(0, 5000)
  if (!body) return { ok: false, text: 'Noten er tom.' }
  const source = actor.channel === 'telegram' ? 'telegram' : 'assistant'
  if (target.kind === 'case') {
    // samme regel som CRM: cases.edit (kontor) — cases.edit.own kræver sags-scope, som assistenten ikke har i fase 1
    if (!hasPermission(actor.role, 'cases.edit')) {
      await audit(admin, actor, 'denied', target.id, target.label, { reason: 'cases.edit', intent: 'note' })
      return { ok: false, text: 'Du har ikke ret til at skrive noter på sager.' }
    }
    const { data, error } = await admin.from('case_notes').insert({ case_id: target.id, content: body, kind: 'note', urgency: null, source, created_by: actor.profileId }).select('id').single()
    if (error || !data) return { ok: false, text: 'Noten kunne ikke gemmes på sagen.' }
    await audit(admin, actor, 'note_created', (data as { id: string }).id, target.label, { target_kind: 'case', target_id: target.id, content_length: body.length })
    return { ok: true, text: `📝 Note gemt på ${target.label}.` }
  }
  const { data, error } = await admin.from('customer_notes').insert({ customer_id: target.id, content: body, source, created_by: actor.profileId }).select('id').single()
  if (error || !data) return { ok: false, text: 'Noten kunne ikke gemmes på kunden.' }
  await audit(admin, actor, 'note_created', (data as { id: string }).id, target.label, { target_kind: 'customer', target_id: target.id, content_length: body.length })
  return { ok: true, text: `📝 Note gemt på ${target.label}.`, buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.id }] }
}
