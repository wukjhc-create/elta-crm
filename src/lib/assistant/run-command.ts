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
import { getCaseScope } from '@/lib/auth/case-scope'
import { copenhagenParts, copenhagenLocalToIso, copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'
import { escapeLike } from '@/lib/validations/postgrest-filter'

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
import { ASSISTANT_RULE, ASSISTANT_RULES } from './rules'

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

  if (cmd.intent === 'help') {
    return {
      ok: true,
      text: [
        'ELTA Assistant — eksempler:',
        '• Ring til Hansen i morgen kl. 10',
        '• Besigtigelse hos Jensen d. 14/10 kl. 9',
        '• Mind mig om at bestille arbejdstøj fredag kl. 9',
        '• Note til SVC-01019: kunden ønsker hvid tavle',
        '• Find Hansen  /  Status på SVC-01019',
        '• Flyt opkaldet til Hansen til fredag kl. 10',
        '• Flyt påmindelsen om arbejdstøj til mandag kl. 8',
        '• I dag — dine opkald, aftaler og påmindelser',
        'Alt gemmes i CRM.',
      ].join('\n'),
    }
  }

  if (cmd.intent === 'today') {
    // Dagens overblik læses fra CRM: egne åbne assistent-opgaver + egne personlige påmindelser med tid i dag (dansk dato)
    const today = copenhagenParts(now).date
    const dayStart = copenhagenLocalToIso(today, '00:00')
    // Assistent-review 2026-10-08 (#10): næste danske midnat (23/25-timers døgn ved sommertid)
    const dayEnd = copenhagenLocalToIso(copenhagenDatePlusDays(1, now), '00:00')
    const [{ data: tasks }, { data: personal }] = await Promise.all([
      admin.from('customer_tasks').select('id, title, due_date').eq('assigned_to', actor.profileId).in('auto_rule', ASSISTANT_RULES).neq('status', 'done').gte('due_date', dayStart).lt('due_date', dayEnd).order('due_date').limit(30),
      admin.from('personal_reminders').select('id, title, due_at').eq('owner_id', actor.profileId).eq('status', 'pending').gte('due_at', dayStart).lt('due_at', dayEnd).order('due_at').limit(30),
    ])
    const items = [
      ...((tasks ?? []) as Array<{ title: string; due_date: string }>).map((t) => ({ at: t.due_date, line: t.title })),
      ...((personal ?? []) as Array<{ title: string; due_at: string }>).map((p) => ({ at: p.due_at, line: `⏰ ${p.title}` })),
    ].sort((a, b) => a.at.localeCompare(b.at))
    await audit(admin, actor, 'today', null, null, { count: items.length })
    if (!items.length) return { ok: true, text: 'Ingen opkald, aftaler eller påmindelser i dag.' }
    return { ok: true, text: `I dag (${items.length}):\n${items.map((i) => `• ${copenhagenParts(i.at).clock} ${i.line}`).join('\n')}` }
  }

  if (cmd.intent === 'reschedule' && cmd.moveKind === 'personal') {
    // Kun EGNE personlige påmindelser; præcis ét åbent træf på titlen — ellers spørg
    const due = cmd.when!.iso!
    const { data } = await admin.from('personal_reminders').select('id, title').eq('owner_id', actor.profileId).eq('status', 'pending').ilike('title', `%${escapeLike(cmd.text ?? '')}%`).limit(5)
    const hits = (data ?? []) as Array<{ id: string; title: string }>
    if (!hits.length) return { ok: false, text: `Jeg fandt ingen åben påmindelse om "${cmd.text}".` }
    if (hits.length > 1) return { ok: false, text: `Flere påmindelser passer — skriv mere af titlen:\n${hits.map((h) => `• ${h.title}`).join('\n')}` }
    await admin.from('personal_reminders').update({ due_at: due, reminder_at: due, updated_at: now.toISOString() }).eq('id', hits[0].id).eq('owner_id', actor.profileId)
    await audit(admin, actor, 'personal_reminder_rescheduled', hits[0].id, hits[0].title, { due })
    return { ok: true, taskId: hits[0].id, text: `⏰ Flyttet: ${hits[0].title} — ${fmtWhen(due)}.` }
  }

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
  // Assistent-review 2026-10-08 (#1): sags-scope som i CRM (salg: egne sager, montør: sager med egne job)
  const caseFilter = async (ids: string[]) => {
    const scope = await getCaseScope({ role: actor.role, userId: actor.profileId, supabase: admin })
    return new Set(scope.type === 'all' ? ids : ids.filter((id) => scope.caseIds.includes(id)))
  }
  const res = await resolveTarget(admin, cmd.target, caseFilter)
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

  if (cmd.intent === 'reschedule') {
    // Flyt en åben assistent-opgave (opkald/påmindelse/aftale) på kunden/sagen — kun egne (admin/serviceleder: alle).
    // Præcis ét træf — ellers spørg. Påmindelsen flyttes med (samme forsprang som ved oprettelsen).
    const due = cmd.when!.iso!
    let q = admin.from('customer_tasks').select('id, title, due_date, reminder_at, assigned_to').in('auto_rule', ASSISTANT_RULES).neq('status', 'done')
    q = target.kind === 'case' ? q.eq('service_case_id', target.id) : q.eq('customer_id', target.id)
    if (!['admin', 'serviceleder'].includes(actor.role)) q = q.eq('assigned_to', actor.profileId)
    const { data } = await q.order('due_date').limit(5)
    const hits = (data ?? []) as Array<{ id: string; title: string; due_date: string | null; reminder_at: string | null }>
    if (!hits.length) return { ok: false, text: `Jeg fandt ingen åben opgave fra assistenten på ${target.label}.` }
    if (hits.length > 1) return { ok: false, text: `Flere åbne opgaver på ${target.label} — flyt dem i CRM:\n${hits.map((h) => `• ${h.title}${h.due_date ? ` (${fmtWhen(h.due_date)})` : ''}`).join('\n')}` }
    const h = hits[0]
    const lead = h.due_date && h.reminder_at ? new Date(h.due_date).getTime() - new Date(h.reminder_at).getTime() : 0
    const reminderAt = new Date(new Date(due).getTime() - Math.max(lead, 0)).toISOString()
    await admin.from('customer_tasks').update({ due_date: due, reminder_at: reminderAt, updated_at: now.toISOString() }).eq('id', h.id)
    await audit(admin, actor, 'task_rescheduled', h.id, h.title, { due, previous_due: h.due_date })
    return { ok: true, taskId: h.id, text: `📅 Flyttet: ${h.title} — ${fmtWhen(due)} (påmindelse ${fmtWhen(reminderAt)}).` }
  }

  if (cmd.intent === 'lookup') {
    if (target.kind === 'case') {
      const [{ data }, { data: wo }] = await Promise.all([
        admin.from('service_cases').select('case_number, title, status, start_date, end_date').eq('id', target.id).single(),
        // kun med arbejdsordre-rettighed (salg har ingen work_orders.view)
        hasPermission(actor.role, 'work_orders.view.all') || hasPermission(actor.role, 'work_orders.view.assigned')
          ? admin.from('work_orders').select('title, scheduled_date, status').eq('case_id', target.id).in('status', ['planned', 'in_progress']).not('scheduled_date', 'is', null).order('scheduled_date').limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const c = data as { case_number: string; title: string | null; status: string; start_date: string | null; end_date: string | null } | null
      const next = wo as { title: string; scheduled_date: string; status: string } | null
      await audit(admin, actor, 'lookup', target.id, target.label, { kind: 'case' })
      const lines = c ? [`${c.case_number} ${c.title ?? ''}`.trim(), `Status: ${c.status}`] : [target.label]
      if (c?.start_date) lines.push(`Start: ${c.start_date}`)
      const mayViewWo = hasPermission(actor.role, 'work_orders.view.all') || hasPermission(actor.role, 'work_orders.view.assigned')
      if (mayViewWo) lines.push(next ? `Næste arbejdsordre: ${next.scheduled_date} — ${next.title}${next.status === 'in_progress' ? ' (i gang)' : ''}` : 'Ingen planlagt arbejdsordre')
      return { ok: true, text: lines.join('\n'), buttons: target.customerId ? [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId }] : undefined }
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
