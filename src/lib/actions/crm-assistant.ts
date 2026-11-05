'use server'

/**
 * CRM-assistenten. Læser med brugerens klient og svarer.
 * Skriver ikke, sender ikke og godkender ikke.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { createCustomerTask } from '@/lib/actions/customer-tasks'
import { userCanViewCustomer } from '@/lib/auth/customer-scope'
import {
  casesMissingPowerOfAttorney,
  copenhagenDate,
  explainCrmQuestion,
  followUpPreview,
  historyLines,
  interpretCrmQuestion,
  planAssistantNote,
  planAssistantTask,
  planInspectionMove,
  planMailLink,
  planTaskAssign,
  resolveDanishDay,
  selectOutstandingCallbacks,
  type CallbackRow,
  type CrmProposal,
  type PoaCaseRow,
  type PoaDocRow,
} from '@/lib/assistant/crm-questions'
import type { CommCandidate } from '@/lib/automation/comm-preview'
import { getCustomerCommunicationTimeline } from '@/lib/actions/communication-timeline'
import { orIlikeContains } from '@/lib/validations/postgrest-filter'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { readCasesWithoutNextAction } from '@/lib/operations/open-cases'
import { overdueTaskFilter } from '@/lib/tasks/overdue-query'
import { copenhagenDatePlusDays, copenhagenLocalToIso, copenhagenParts } from '@/lib/utils/copenhagen-time'
import { isBookedCustomerBesigtigelse, rescheduledBesigtigelseDescription } from '@/lib/tasks/besigtigelse-task'
import { updateCustomerTask } from '@/lib/actions/customer-tasks'
import { createCustomerNote } from '@/lib/actions/customer-notes'
import { linkEmailToCase } from '@/lib/actions/incoming-emails'

export type { CrmProposal }

export interface CrmAnswer {
  ok: boolean
  text: string
  items: Array<{ title: string; detail: string; href: string | null }>
  sends: false
  proposal: CrmProposal | null
}

function answer(ok: boolean, text: string, items: CrmAnswer['items'] = [], proposal: CrmProposal | null = null): CrmAnswer {
  return { ok, text, items, sends: false, proposal }
}

function ageDays(iso: string | null, today: string): number {
  const day = copenhagenDate(iso)
  if (!day) return 0
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000))
}

export async function answerCrmQuestion(question: string): Promise<CrmAnswer> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('customers.view')) return answer(false, permissionDeniedText('customers.view'))
  const parsed = interpretCrmQuestion(question)
  if (parsed.kind === 'propose_task') return proposeTask(ctx.supabase, parsed.caseNumber, parsed.assigneeName)
  if (parsed.kind === 'propose_move' && parsed.action?.type === 'move_inspection') return proposeMove(ctx.supabase, parsed.action, copenhagenParts(new Date()).date)
  if (parsed.kind === 'propose_assign' && parsed.action?.type === 'assign_task') return proposeAssign(ctx.supabase, parsed.action.caseNumber, parsed.action.assigneeName)
  if (parsed.kind === 'propose_note' && parsed.action?.type === 'add_note') {
    const note = parsed.action
    return proposeNote(ctx.supabase, note.scope === 'case'
      ? { kind: 'add_note', scope: 'case', caseNumber: note.caseNumber, text: note.text }
      : { kind: 'add_note', scope: 'customer', customerName: note.customerName, text: note.text })
  }
  if (parsed.kind === 'propose_link' && parsed.action?.type === 'link_mail') return proposeLink(ctx.supabase, parsed.action.subject, parsed.action.caseNumber)
  if (parsed.kind === 'help' || parsed.kind === 'unknown' || parsed.kind === 'write' || parsed.kind === 'propose_move' || parsed.kind === 'propose_assign' || parsed.kind === 'propose_note' || parsed.kind === 'propose_link') {
    return answer(parsed.kind !== 'unknown', explainCrmQuestion(parsed))
  }

  const today = copenhagenParts(new Date()).date
  if (parsed.kind === 'callbacks') return callbacks(ctx.supabase, today, parsed.todayOnly)
  if (parsed.kind === 'missing_poa') return missingPoa(ctx.supabase)
  if (parsed.kind === 'history') return history(ctx.supabase, parsed.name ?? '')
  if (parsed.kind === 'jobs_today') return jobsOnDay(ctx.supabase, today, 'i dag')
  if (parsed.kind === 'jobs_tomorrow') return jobsOnDay(ctx.supabase, copenhagenDatePlusDays(1), 'i morgen')
  if (parsed.kind === 'overdue_tasks') return overdueTasks(ctx)
  if (parsed.kind === 'supplier_invoices') return supplierInvoices(ctx)
  if (parsed.kind === 'cases_without_action') return casesWithoutAction(ctx)
  if (parsed.kind === 'unresolved') return unresolved(ctx.supabase)
  return followups(ctx.supabase, today)
}

async function callbacks(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], today: string, todayOnly: boolean): Promise<CrmAnswer> {
  const { data, error } = await supabase
    .from('customer_tasks')
    .select('id, title, customer_id, service_case_id, due_date, created_at, auto_rule')
    .in('auto_rule', ['assistant_missed_call', 'assistant_callback'])
    .neq('status', 'done')
    .order('due_date', { ascending: true })
    .limit(100)
  if (error) return answer(false, 'Tilbageringningerne kunne ikke læses. Det betyder ikke, at der er nul.')
  const rows = (data ?? []) as Array<{ id: string; title: string; customer_id: string; service_case_id: string | null; due_date: string | null; created_at: string; auto_rule: string | null }>
  const ids = [...new Set(rows.map((r) => r.customer_id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const cust = await supabase.from('customers').select('id, company_name').in('id', ids)
    if (cust.error) return answer(false, 'Kunderne på opgaverne kunne ikke læses. Listen vises ikke som tom.')
    for (const c of (cust.data ?? []) as Array<{ id: string; company_name: string }>) names.set(c.id, c.company_name)
  }
  const open: CallbackRow[] = rows.map((r) => ({ id: r.id, title: r.title, customerId: r.customer_id, customerName: names.get(r.customer_id) ?? null, caseId: r.service_case_id, dueAt: r.due_date, createdAt: r.created_at, autoRule: r.auto_rule }))
  const selected = selectOutstandingCallbacks(open, today, todayOnly)
  if (!selected.length) return answer(true, todayOnly ? 'Ingen åbne tilbageringninger med tid i dag.' : 'Ingen åbne tilbageringninger.')
  return answer(true, todayOnly ? 'Åbne tilbageringninger i dag:' : 'Åbne tilbageringninger:', selected.map((r) => ({
    title: r.title,
    detail: r.customerName ?? 'Kunde',
    href: `/dashboard/customers/${r.customerId}`,
  })))
}

async function missingPoa(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']): Promise<CrmAnswer> {
  const { data, error } = await supabase
    .from('service_cases')
    .select('id, case_number, title, customer_id, status, created_at')
    .eq('is_proposal', false)
    .not('status', 'in', '(closed,converted,cancelled)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return answer(false, 'Sagerne kunne ikke læses. Det betyder ikke, at ingen mangler fuldmagt.')
  const cases = (data ?? []) as Array<{ id: string; case_number: string | null; title: string; customer_id: string | null; status: string; created_at: string }>
  const customerIds = [...new Set(cases.map((c) => c.customer_id).filter(Boolean) as string[])]
  const docs: PoaDocRow[] = []
  for (let i = 0; i < customerIds.length; i += 200) {
    const chunk = customerIds.slice(i, i + 200)
    // side for side: et afkortet dokumentsæt ville markere sager MED fuldmagt som manglende
    let res: Array<{ customer_id: string | null; service_case_id: string | null; document_type: string | null; description: string | null }>
    try {
      res = await fetchAllRows((f, t) => supabase.from('customer_documents').select('id, customer_id, service_case_id, document_type, description')
        .in('customer_id', chunk).eq('document_type', 'contract').order('id').range(f, t))
    } catch {
      return answer(false, 'Dokumenterne kunne ikke læses. Ingen sag er markeret som manglende fuldmagt.')
    }
    for (const d of res) {
      docs.push({ customerId: d.customer_id, serviceCaseId: d.service_case_id, documentType: d.document_type, description: d.description })
    }
  }
  const caseRows: PoaCaseRow[] = cases.map((c) => ({ id: c.id, caseNumber: c.case_number, title: c.title, customerId: c.customer_id, status: c.status }))
  const missing = casesMissingPowerOfAttorney(caseRows, docs)
  const cap = cases.length === 200 ? ' Viser de 200 nyeste åbne sager, du kan se.' : ''
  if (!missing.length) return answer(true, `Ingen af de læste åbne sager mangler en fuldmagt, ud fra de dokumenter du kan se.${cap}`)
  return answer(true, `Sager uden fuldmagt i de dokumenter, du kan se.${cap}`, missing.map((c) => ({
    title: `${c.caseNumber ?? 'Sag'} — ${c.title}`,
    detail: 'Ingen fuldmagt på sagen eller kunden',
    href: `/dashboard/orders/${c.id}`,
  })))
}

async function history(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], name: string): Promise<CrmAnswer> {
  if (name.trim().length < 2) return answer(false, 'Skriv kundens navn, fx “hvad skete der med kunde Jensen”.')
  const { data, error } = await supabase.from('customers').select('id, company_name').or(orIlikeContains(['company_name', 'contact_person'], name.trim())).limit(8)
  if (error) return answer(false, 'Kundesøgningen fejlede. Der er ikke valgt en kunde.')
  const rows = (data ?? []) as Array<{ id: string; company_name: string }>
  if (rows.length === 0) return answer(true, `Ingen kunde matcher “${name.trim()}”.`)
  if (rows.length > 1) return answer(true, 'Flere kunder matcher. Vælg en.', rows.map((r) => ({ title: r.company_name, detail: 'Kunde', href: `/dashboard/customers/${r.id}` })))
  const timeline = await getCustomerCommunicationTimeline(rows[0].id)
  if (!timeline.ok) return answer(false, timeline.error ?? 'Tidslinjen kunne ikke læses.')
  const failed = timeline.sources.filter((s) => s.state === 'error')
  const lines = historyLines(timeline.events)
  const prefix = failed.length ? 'Noget af tidslinjen kunne ikke læses og er udeladt. ' : ''
  if (!lines.length) return answer(true, `${prefix}Ingen hændelser på ${rows[0].company_name} i de kilder, der kunne læses.`, [{ title: rows[0].company_name, detail: 'Åbn kunden', href: `/dashboard/customers/${rows[0].id}` }])
  return answer(true, `${prefix}Seneste på ${rows[0].company_name}:`, lines.map((line) => ({ title: line, detail: rows[0].company_name, href: `/dashboard/customers/${rows[0].id}` })))
}

async function followups(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], today: string): Promise<CrmAnswer> {
  const [calls, inspections] = await Promise.all([
    supabase.from('customer_tasks').select('id, title, customer_id, created_at, auto_rule').in('auto_rule', ['assistant_missed_call', 'assistant_callback']).neq('status', 'done').limit(50),
    supabase.from('customer_tasks').select('id, title, customer_id, created_at').ilike('title', '%esigtigelse%').neq('status', 'done').limit(30),
  ])
  if (calls.error || inspections.error) return answer(false, 'Opfølgningen kunne ikke læses. Intet er sendt.')
  const candidates: CommCandidate[] = []
  for (const row of (calls.data ?? []) as Array<{ id: string; title: string; customer_id: string; created_at: string }>) {
    candidates.push({ ruleId: 'callback.reminder', entityId: row.id, customerId: row.customer_id, label: row.title, ageDays: ageDays(row.created_at, today), reason: 'Åben tilbageringning' })
  }
  for (const row of (inspections.data ?? []) as Array<{ id: string; title: string; customer_id: string; created_at: string }>) {
    candidates.push({ ruleId: 'inspection.reminder', entityId: row.id, customerId: row.customer_id, label: row.title, ageDays: ageDays(row.created_at, today), reason: 'Åben besigtigelse' })
  }
  const preview = followUpPreview(candidates)
  if (!preview.length) return answer(true, 'Ingen forfaldne forslag i de læste opgaver. Der er ikke sendt noget.')
  return answer(true, 'Forslag. Intet er sendt.', preview.map((item) => ({
    title: item.template,
    detail: `${item.followUp} Kanal: ${item.channel}.`,
    href: item.customerId ? `/dashboard/customers/${item.customerId}` : null,
  })))
}

type AssistantClient = Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']

async function resolveTaskTarget(supabase: AssistantClient, caseNumber: string | null, assigneeName: string | null): Promise<
  | { ok: false; reason: string; items: CrmAnswer['items'] }
  | { ok: true; caseId: string; caseNumber: string; customerId: string; title: string; assigneeId: string | null; assigneeLabel: string | null }
> {
  const plan = planAssistantTask({ confirmed: false, caseNumber, caseMatches: caseNumber ? 1 : 0, assigneeName, assigneeMatches: assigneeName ? 1 : 0 })
  if (!caseNumber) return { ok: false, reason: plan.reason, items: [] }
  const cases = await supabase
    .from('service_cases')
    .select('id, case_number, title, customer_id')
    .eq('case_number', caseNumber)
    .eq('is_proposal', false)
    .limit(5)
  if (cases.error) return { ok: false, reason: 'Sagen kunne ikke læses. Intet er oprettet.', items: [] }
  const rows = (cases.data ?? []) as Array<{ id: string; case_number: string | null; title: string | null; customer_id: string | null }>
  if (rows.length !== 1) {
    const blocked = planAssistantTask({ confirmed: true, caseNumber, caseMatches: rows.length, assigneeName, assigneeMatches: 0 })
    return {
      ok: false,
      reason: blocked.reason,
      items: rows.filter((r) => r.customer_id).map((r) => ({ title: `${r.case_number ?? caseNumber} — ${r.title ?? 'Sag'}`, detail: 'Sag', href: `/dashboard/orders/${r.id}` })),
    }
  }
  const sag = rows[0]
  if (!sag.customer_id) return { ok: false, reason: 'Sagen har ingen kunde. Intet er oprettet.', items: [] }
  let assigneeId: string | null = null
  let assigneeLabel: string | null = null
  if (assigneeName) {
    const people = await activeAssigneesByName(assigneeName)
    if (people.error) return { ok: false, reason: 'Medarbejderen kunne ikke læses. Intet er oprettet.', items: [] }
    const hits = (people.data ?? []) as Array<{ id: string; full_name: string | null }>
    const decided = planAssistantTask({ confirmed: true, caseNumber, caseMatches: 1, assigneeName, assigneeMatches: hits.length })
    if (!decided.execute && hits.length !== 1) {
      return { ok: false, reason: decided.reason, items: hits.map((p) => ({ title: p.full_name ?? 'Medarbejder', detail: 'Flere match', href: null })) }
    }
    assigneeId = hits[0]?.id ?? null
    assigneeLabel = hits[0]?.full_name ?? assigneeName
  }
  return {
    ok: true,
    caseId: sag.id,
    caseNumber: sag.case_number ?? caseNumber,
    customerId: sag.customer_id,
    title: `Opgave på sag ${sag.case_number ?? caseNumber}`,
    assigneeId,
    assigneeLabel,
  }
}

/**
 * Aktive medarbejdere hvis navn indeholder teksten. profiles-RLS viser kun brugerens EGEN profil, så opslaget med
 * brugerens klient fandt aldrig en kollega (tildeling til andre var umulig). Som getActiveProfiles: admin-klient bag
 * tasks.create, kun id + navn, kun aktive. Uden tasks.create: ingen kandidater (montøren tildeler kun sig selv).
 */
async function activeAssigneesByName(name: string): Promise<{ data: Array<{ id: string; full_name: string | null }> | null; error: { message: string } | null }> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('tasks.create')) return { data: [], error: null }
  const { data, error } = await createAdminClient().from('profiles').select('id, full_name').eq('is_active', true)
    .or(orIlikeContains(['full_name'], name)).limit(8)
  return { data: (data ?? null) as Array<{ id: string; full_name: string | null }> | null, error: error ? { message: error.message } : null }
}

async function proposeTask(supabase: AssistantClient, caseNumber: string | null, assigneeName: string | null): Promise<CrmAnswer> {
  const resolved = await resolveTaskTarget(supabase, caseNumber, assigneeName)
  if (!resolved.ok) return answer(resolved.reason.startsWith('Sagen kunne ikke') || resolved.reason.startsWith('Medarbejderen kunne ikke') ? false : true, resolved.reason, resolved.items)
  const who = resolved.assigneeLabel ? ` til ${resolved.assigneeLabel}` : ''
  return answer(true, `Forslag: opret “${resolved.title}”${who}. Intet er oprettet, før du bekræfter.`, [{
    title: resolved.title,
    detail: resolved.assigneeLabel ?? 'Tildeles dig selv',
    href: `/dashboard/orders/${resolved.caseId}`,
  }], {
    kind: 'create_task',
    caseNumber: resolved.caseNumber,
    assigneeName,
  })
}

export async function confirmAssistantTask(input: {
  confirmed: boolean
  caseNumber: string | null
  assigneeName: string | null
}): Promise<{ success: boolean; wrote: boolean; message: string }> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('customers.view')) return { success: false, wrote: false, message: permissionDeniedText('customers.view') }
  if (!input.confirmed) return { success: false, wrote: false, message: 'Bekræft opgaven, før den oprettes.' }
  const resolved = await resolveTaskTarget(ctx.supabase, input.caseNumber, input.assigneeName)
  if (!resolved.ok) return { success: false, wrote: false, message: resolved.reason }
  if (!(await userCanViewCustomer(resolved.customerId, ctx))) return { success: false, wrote: false, message: 'Du har ikke adgang til kunden. Intet er oprettet.' }
  const ready = planAssistantTask({
    confirmed: true,
    caseNumber: resolved.caseNumber,
    caseMatches: 1,
    assigneeName: input.assigneeName,
    assigneeMatches: input.assigneeName ? 1 : 0,
  })
  if (!ready.execute) return { success: false, wrote: false, message: ready.reason }
  const created = await createCustomerTask({
    customer_id: resolved.customerId,
    service_case_id: resolved.caseId,
    title: resolved.title,
    description: 'Oprettet fra CRM-assistenten efter bekræftelse.',
    assigned_to: resolved.assigneeId ?? undefined,
    priority: 'normal',
  })
  return created.success
    ? { success: true, wrote: true, message: 'Opgaven er oprettet.' }
    : { success: false, wrote: false, message: created.error ?? 'Opgaven blev ikke oprettet.' }
}

async function visibleCase(supabase: AssistantClient, caseNumber: string) {
  const cases = await supabase.from('service_cases').select('id, case_number, title, customer_id').eq('case_number', caseNumber).eq('is_proposal', false).limit(5)
  if (cases.error) return { error: 'Sagen kunne ikke læses. Intet er ændret.' as const, rows: [] as Array<{ id: string; case_number: string | null; title: string | null; customer_id: string | null }> }
  return { error: null, rows: (cases.data ?? []) as Array<{ id: string; case_number: string | null; title: string | null; customer_id: string | null }> }
}

async function jobsOnDay(supabase: AssistantClient, day: string, when: string): Promise<CrmAnswer> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('id, title, scheduled_date, status, case_id')
    .eq('scheduled_date', day)
    .in('status', ['planned', 'in_progress'])
    .order('title')
    .limit(40)
  if (error) return answer(false, 'Arbejdsordrerne kunne ikke læses. Det betyder ikke, at der er nul job.')
  const rows = (data ?? []) as Array<{ id: string; title: string | null; case_id: string | null; status: string }>
  if (!rows.length) return answer(true, `Ingen planlagte arbejdsordrer ${when}, som du kan se.`)
  const capped = rows.length === 40 ? ' Viser 40. Der kan være flere.' : ''
  return answer(true, `Arbejdsordrer ${when}.${capped}`, rows.map((r) => ({
    title: r.title ?? 'Arbejdsordre',
    detail: r.status === 'in_progress' ? 'I gang' : 'Planlagt',
    href: r.case_id ? `/dashboard/orders/${r.case_id}` : null,
  })))
}

async function overdueTasks(ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>): Promise<CrmAnswer> {
  const query = overdueTaskFilter(ctx.supabase.from('customer_tasks').select('id, title, customer_id, due_date'), { userId: ctx.userId, hasPermission: ctx.hasPermission as (p: never) => boolean }, new Date())
  if (!query) return answer(false, 'De forfaldne opgaver kunne ikke læses. Det betyder ikke, at der er nul.')
  const { data, error } = await query.order('due_date', { ascending: true }).limit(30)
  if (error) return answer(false, 'De forfaldne opgaver kunne ikke læses. Det betyder ikke, at der er nul.')
  const rows = (data ?? []) as Array<{ id: string; title: string | null; customer_id: string | null; due_date: string | null }>
  if (!rows.length) return answer(true, 'Ingen forfaldne opgaver, som du kan se.')
  const capped = rows.length === 30 ? ' Viser 30. Der kan være flere.' : ''
  return answer(true, `Forfaldne opgaver.${capped}`, rows.map((r) => ({
    title: r.title ?? 'Opgave',
    detail: copenhagenDate(r.due_date) ? `Forfalden ${copenhagenDate(r.due_date)}` : 'Forfalden',
    href: r.customer_id ? `/dashboard/customers/${r.customer_id}` : '/dashboard/tasks',
  })))
}

async function supplierInvoices(ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>): Promise<CrmAnswer> {
  if (!ctx.hasPermission('incoming_invoices.view')) return answer(false, 'Du har ikke adgang til leverandørfakturaer. Det tælles ikke som nul.')
  const { data, error } = await ctx.supabase.from('incoming_invoices').select('id, invoice_number, supplier_name_extracted').eq('requires_manual_review', true).in('status', ['received', 'awaiting_approval']).order('created_at', { ascending: false }).limit(30)
  if (error) return answer(false, 'Leverandørfakturaerne kunne ikke læses. Det betyder ikke, at der er nul.')
  const rows = (data ?? []) as Array<{ id: string; invoice_number: string | null; supplier_name_extracted: string | null }>
  if (!rows.length) return answer(true, 'Ingen leverandørfakturaer venter på gennemgang, som du kan se.')
  const capped = rows.length === 30 ? ' Viser 30. Der kan være flere.' : ''
  return answer(true, `Leverandørfakturaer til gennemgang.${capped} Der godkendes ikke herfra.`, rows.map((r) => ({
    title: r.invoice_number ?? 'Faktura',
    detail: r.supplier_name_extracted ?? 'Leverandør',
    href: `/dashboard/incoming-invoices/${r.id}`,
  })))
}

async function casesWithoutAction(ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>): Promise<CrmAnswer> {
  if (!ctx.hasPermission('cases.view.all') && !ctx.hasPermission('cases.view.assigned')) return answer(false, 'Du har ikke adgang til sager. Det tælles ikke som nul.')
  const found = await readCasesWithoutNextAction(ctx.supabase, createAdminClient)
  if (!found.ok) return answer(false, found.reason)
  if (!found.cases.length) return answer(true, 'Ingen åbne sager uden næste handling, som du kan se.')
  const shown = found.cases.slice(0, 30)
  const capped = found.cases.length > 30 ? ` Viser 30 af ${found.cases.length}.` : ''
  return answer(true, `Sager uden ufærdig opgave og uden planlagt arbejde.${capped}`, shown.map((row) => ({
    title: row.caseNumber ?? 'Sag',
    detail: row.title ?? 'Uden titel',
    href: `/dashboard/orders/${row.id}`,
  })))
}

async function unresolved(supabase: AssistantClient): Promise<CrmAnswer> {
  const [mail, calls] = await Promise.all([
    supabase.from('incoming_emails').select('id, subject, customer_id').eq('is_archived', false).eq('link_status', 'linked').is('service_case_id', null).order('received_at', { ascending: false }).limit(30),
    supabase.from('customer_tasks').select('id, title, customer_id').in('auto_rule', ['assistant_missed_call', 'assistant_callback']).neq('status', 'done').order('due_date', { ascending: true }).limit(30),
  ])
  if (mail.error && calls.error) return answer(false, 'Mail og opkald kunne ikke læses. Det betyder ikke, at der er nul.')
  const items: CrmAnswer['items'] = []
  let text = ''
  if (mail.error) text += 'Mails uden sag kunne ikke læses. '
  else {
    const rows = (mail.data ?? []) as Array<{ id: string; subject: string | null; customer_id: string | null }>
    text += rows.length ? `${rows.length} viste mails er knyttet til en kunde, men ikke til en sag. ` : 'Ingen viste mails mangler en sag. '
    for (const row of rows.slice(0, 15)) items.push({ title: row.subject ?? 'Mail uden emne', detail: 'Ikke knyttet til en sag', href: row.customer_id ? `/dashboard/customers/${row.customer_id}` : '/dashboard/mail' })
  }
  if (calls.error) text += 'Tilbageringninger kunne ikke læses.'
  else {
    const rows = (calls.data ?? []) as Array<{ id: string; title: string; customer_id: string }>
    text += rows.length ? `${rows.length} åbne tilbageringninger.` : 'Ingen åbne tilbageringninger i de læste opgaver.'
    for (const row of rows.slice(0, 15)) items.push({ title: row.title, detail: 'Åbent opkald', href: `/dashboard/customers/${row.customer_id}` })
  }
  return answer(!mail.error || !calls.error, text.trim(), items)
}

async function proposeMove(supabase: AssistantClient, action: { caseNumber: string; when: string; time: string | null }, today: string): Promise<CrmAnswer> {
  const date = resolveDanishDay(action.when, today)
  const preview = planInspectionMove({ confirmed: false, caseMatches: 1, inspectionMatches: 1, date, time: action.time, today })
  if (!date || !action.time) return answer(true, preview.reason)
  const found = await visibleCase(supabase, action.caseNumber)
  if (found.error) return answer(false, found.error)
  const blocked = planInspectionMove({ confirmed: false, caseMatches: found.rows.length, inspectionMatches: 1, date, time: action.time, today })
  if (found.rows.length !== 1) return answer(true, blocked.reason, found.rows.filter((r) => r.customer_id).map((r) => ({ title: `${r.case_number ?? action.caseNumber} — ${r.title ?? 'Sag'}`, detail: 'Sag', href: `/dashboard/orders/${r.id}` })))
  const sag = found.rows[0]
  const tasks = await supabase.from('customer_tasks').select('id, title, auto_rule, status').eq('service_case_id', sag.id).neq('status', 'done').limit(50)
  if (tasks.error) return answer(false, 'Besigtigelserne kunne ikke læses. Intet er flyttet.')
  const rows = (tasks.data ?? []) as Array<{ id: string; title: string | null; auto_rule: string | null; status: string | null }>
  if (rows.length >= 50) return answer(true, 'Sagen har for mange åbne opgaver til at vælge sikkert. Intet er flyttet.')
  const inspections = rows.filter((t) => isBookedCustomerBesigtigelse(t))
  const decided = planInspectionMove({ confirmed: false, caseMatches: 1, inspectionMatches: inspections.length, date, time: action.time, today })
  if (inspections.length !== 1) {
    return answer(true, decided.reason, inspections.map((t) => ({ title: t.title ?? 'Besigtigelse', detail: 'Booket besigtigelse', href: `/dashboard/orders/${sag.id}` })))
  }
  if (inspections[0].status !== 'pending') {
    return answer(true, 'Kunden har allerede bekræftet den nuværende tid. Ombook besigtigelsen på kundekortet, så kunden får den nye tid. Intet er flyttet.')
  }
  return answer(true, `Forslag: flyt “${inspections[0].title ?? 'Besigtigelse'}” til ${date} kl. ${action.time}. Kunden får ingen mail, før du selv sender en. Intet er flyttet endnu.`, [{
    title: inspections[0].title ?? 'Besigtigelse',
    detail: `${date} kl. ${action.time}`,
    href: `/dashboard/orders/${sag.id}`,
  }], { kind: 'move_inspection', caseNumber: sag.case_number ?? action.caseNumber, date, time: action.time })
}

async function proposeAssign(supabase: AssistantClient, caseNumber: string, assigneeName: string): Promise<CrmAnswer> {
  const found = await visibleCase(supabase, caseNumber)
  if (found.error) return answer(false, found.error)
  if (found.rows.length !== 1) {
    const blocked = planTaskAssign({ confirmed: false, caseMatches: found.rows.length, openTaskMatches: 1, assigneeMatches: 1 })
    return answer(true, blocked.reason, found.rows.map((r) => ({ title: `${r.case_number ?? caseNumber}`, detail: 'Sag', href: `/dashboard/orders/${r.id}` })))
  }
  const sag = found.rows[0]
  const tasks = await supabase.from('customer_tasks').select('id, title, status').eq('service_case_id', sag.id).neq('status', 'done').limit(50)
  if (tasks.error) return answer(false, 'Opgaverne kunne ikke læses. Intet er tildelt.')
  const open = (tasks.data ?? []) as Array<{ id: string; title: string | null }>
  if (open.length >= 50 || open.length !== 1) {
    const blocked = planTaskAssign({ confirmed: false, caseMatches: 1, openTaskMatches: open.length >= 50 ? 2 : open.length, assigneeMatches: 1 })
    return answer(true, blocked.reason, open.slice(0, 15).map((t) => ({ title: t.title ?? 'Opgave', detail: 'Åben opgave', href: `/dashboard/orders/${sag.id}` })))
  }
  const people = await activeAssigneesByName(assigneeName)
  if (people.error) return answer(false, 'Medarbejderen kunne ikke læses. Intet er tildelt.')
  const hits = (people.data ?? []) as Array<{ id: string; full_name: string | null }>
  if (hits.length !== 1) {
    const blocked = planTaskAssign({ confirmed: false, caseMatches: 1, openTaskMatches: 1, assigneeMatches: hits.length })
    return answer(true, blocked.reason, hits.map((p) => ({ title: p.full_name ?? 'Medarbejder', detail: 'Flere match', href: null })))
  }
  return answer(true, `Forslag: tildel “${open[0].title ?? 'Opgave'}” til ${hits[0].full_name ?? assigneeName}. Intet er ændret, før du bekræfter.`, [{
    title: open[0].title ?? 'Opgave',
    detail: hits[0].full_name ?? assigneeName,
    href: `/dashboard/orders/${sag.id}`,
  }], { kind: 'assign_task', caseNumber: sag.case_number ?? caseNumber, assigneeName })
}

async function proposeNote(supabase: AssistantClient, action: Extract<CrmProposal, { kind: 'add_note' }>): Promise<CrmAnswer> {
  if (action.scope === 'case') {
    const found = await visibleCase(supabase, action.caseNumber)
    if (found.error) return answer(false, found.error)
    const plan = planAssistantNote({ confirmed: false, matches: found.rows.length, text: action.text })
    if (found.rows.length !== 1) return answer(true, plan.reason, found.rows.map((r) => ({ title: r.case_number ?? action.caseNumber, detail: 'Sag', href: `/dashboard/orders/${r.id}` })))
    return answer(true, 'Forslag: gem noten på kunden for sagen. Intet er gemt, før du bekræfter.', [{
      title: action.text.slice(0, 120),
      detail: found.rows[0].case_number ?? action.caseNumber,
      href: `/dashboard/orders/${found.rows[0].id}`,
    }], action)
  }
  const { data, error } = await supabase.from('customers').select('id, company_name').or(orIlikeContains(['company_name', 'contact_person'], action.customerName)).limit(8)
  if (error) return answer(false, 'Kundesøgningen fejlede. Intet er gemt.')
  const rows = (data ?? []) as Array<{ id: string; company_name: string }>
  const plan = planAssistantNote({ confirmed: false, matches: rows.length, text: action.text })
  if (rows.length !== 1) return answer(true, plan.reason, rows.map((r) => ({ title: r.company_name, detail: 'Kunde', href: `/dashboard/customers/${r.id}` })))
  return answer(true, `Forslag: gem noten på ${rows[0].company_name}. Intet er gemt, før du bekræfter.`, [{
    title: action.text.slice(0, 120),
    detail: rows[0].company_name,
    href: `/dashboard/customers/${rows[0].id}`,
  }], { kind: 'add_note', scope: 'customer', customerName: rows[0].company_name, text: action.text })
}

async function proposeLink(supabase: AssistantClient, subject: string, caseNumber: string): Promise<CrmAnswer> {
  const found = await visibleCase(supabase, caseNumber)
  if (found.error) return answer(false, found.error)
  if (found.rows.length !== 1 || !found.rows[0].customer_id) {
    const plan = planMailLink({ confirmed: false, caseMatches: found.rows.length, mailMatches: 1, sameCustomer: true })
    return answer(true, found.rows[0] && !found.rows[0].customer_id ? 'Sagen har ingen kunde. Intet er knyttet.' : plan.reason)
  }
  const mail = await supabase.from('incoming_emails').select('id, subject, customer_id, service_case_id').eq('subject', subject).limit(5)
  if (mail.error) return answer(false, 'Mailen kunne ikke læses. Intet er knyttet.')
  const rows = (mail.data ?? []) as Array<{ id: string; subject: string | null; customer_id: string | null; service_case_id: string | null }>
  const same = rows.length === 1 && rows[0].customer_id === found.rows[0].customer_id
  const plan = planMailLink({ confirmed: false, caseMatches: 1, mailMatches: rows.length, sameCustomer: same })
  if (!plan.execute && rows.length !== 1) return answer(true, plan.reason, rows.map((r) => ({ title: r.subject ?? subject, detail: 'Mail', href: r.customer_id ? `/dashboard/customers/${r.customer_id}` : null })))
  if (!same) return answer(true, plan.reason)
  return answer(true, `Forslag: knyt “${subject}” til sag ${found.rows[0].case_number ?? caseNumber}. Der sendes ikke noget. Intet er knyttet, før du bekræfter.`, [{
    title: subject,
    detail: found.rows[0].case_number ?? caseNumber,
    href: `/dashboard/orders/${found.rows[0].id}`,
  }], { kind: 'link_mail', subject, caseNumber: found.rows[0].case_number ?? caseNumber })
}

export async function confirmAssistantProposal(input: {
  confirmed: boolean
  proposal: CrmProposal | null
}): Promise<{ success: boolean; wrote: boolean; message: string }> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('customers.view')) return { success: false, wrote: false, message: permissionDeniedText('customers.view') }
  if (input.confirmed !== true || !input.proposal) return { success: false, wrote: false, message: 'Bekræft handlingen, før noget ændres.' }
  const proposal = input.proposal
  if (proposal.kind === 'create_task') return confirmAssistantTask({ confirmed: true, caseNumber: proposal.caseNumber, assigneeName: proposal.assigneeName })
  if (proposal.kind === 'move_inspection') return confirmMove(ctx, proposal)
  if (proposal.kind === 'assign_task') return confirmAssign(ctx, proposal)
  if (proposal.kind === 'add_note') return confirmNote(ctx, proposal)
  return confirmLink(ctx, proposal)
}

async function confirmMove(
  ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>,
  proposal: Extract<CrmProposal, { kind: 'move_inspection' }>,
): Promise<{ success: boolean; wrote: boolean; message: string }> {
  const today = copenhagenParts(new Date()).date
  const found = await visibleCase(ctx.supabase, proposal.caseNumber)
  if (found.error) return { success: false, wrote: false, message: found.error }
  if (found.rows.length !== 1 || !found.rows[0].customer_id) {
    const plan = planInspectionMove({ confirmed: true, caseMatches: found.rows.length, inspectionMatches: 0, date: proposal.date, time: proposal.time, today })
    return { success: false, wrote: false, message: plan.reason }
  }
  if (!(await userCanViewCustomer(found.rows[0].customer_id, ctx))) return { success: false, wrote: false, message: 'Du har ikke adgang til kunden. Intet er flyttet.' }
  const tasks = await ctx.supabase.from('customer_tasks').select('id, title, auto_rule, status, description').eq('service_case_id', found.rows[0].id).neq('status', 'done').limit(50)
  if (tasks.error) return { success: false, wrote: false, message: 'Besigtigelserne kunne ikke læses. Intet er flyttet.' }
  const rows = (tasks.data ?? []) as Array<{ id: string; title: string | null; auto_rule: string | null; status: string | null; description: string | null }>
  const inspections = rows.length >= 50 ? [] : rows.filter((t) => isBookedCustomerBesigtigelse(t))
  const plan = planInspectionMove({ confirmed: true, caseMatches: 1, inspectionMatches: rows.length >= 50 ? 2 : inspections.length, date: proposal.date, time: proposal.time, today })
  if (!plan.execute) return { success: false, wrote: false, message: plan.reason }
  const target = inspections[0]
  // Kunden har bekræftet tiden i portalen (status in_progress): en flytning ville arve bekræftelsen for en tid, kunden
  // aldrig har set. Ombook via kundekortet (ny booking + bekræftelsesmail) i stedet.
  if (target.status !== 'pending') {
    return { success: false, wrote: false, message: 'Kunden har allerede bekræftet den nuværende tid. Ombook besigtigelsen på kundekortet, så kunden får den nye tid. Intet er flyttet.' }
  }
  const dateLabel = new Date(`${proposal.date}T12:00:00Z`).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'long', year: 'numeric' })
  const updated = await updateCustomerTask({
    id: target.id,
    due_date: copenhagenLocalToIso(proposal.date, proposal.time),
    // portalen læser klokkeslættet fra beskrivelsen — skal følge den nye tid
    description: rescheduledBesigtigelseDescription(target.description, dateLabel, proposal.time, today),
  })
  return updated.success
    ? { success: true, wrote: true, message: 'Besigtigelsen er flyttet. Kunden har IKKE fået besked — giv kunden den nye tid.' }
    : { success: false, wrote: false, message: updated.error ?? 'Besigtigelsen blev ikke flyttet.' }
}

async function confirmAssign(
  ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>,
  proposal: Extract<CrmProposal, { kind: 'assign_task' }>,
): Promise<{ success: boolean; wrote: boolean; message: string }> {
  const found = await visibleCase(ctx.supabase, proposal.caseNumber)
  if (found.error) return { success: false, wrote: false, message: found.error }
  if (found.rows.length !== 1 || !found.rows[0].customer_id) return { success: false, wrote: false, message: 'Sagen er ikke entydig. Intet er tildelt.' }
  if (!(await userCanViewCustomer(found.rows[0].customer_id, ctx))) return { success: false, wrote: false, message: 'Du har ikke adgang til kunden. Intet er tildelt.' }
  const tasks = await ctx.supabase.from('customer_tasks').select('id, title').eq('service_case_id', found.rows[0].id).neq('status', 'done').limit(50)
  if (tasks.error) return { success: false, wrote: false, message: 'Opgaverne kunne ikke læses. Intet er tildelt.' }
  const open = (tasks.data ?? []) as Array<{ id: string }>
  const people = await activeAssigneesByName(proposal.assigneeName)
  if (people.error) return { success: false, wrote: false, message: 'Medarbejderen kunne ikke læses. Intet er tildelt.' }
  const hits = (people.data ?? []) as Array<{ id: string }>
  const plan = planTaskAssign({ confirmed: true, caseMatches: 1, openTaskMatches: open.length >= 50 ? 2 : open.length, assigneeMatches: hits.length })
  if (!plan.execute) return { success: false, wrote: false, message: plan.reason }
  const updated = await updateCustomerTask({ id: open[0].id, assigned_to: hits[0].id })
  return updated.success
    ? { success: true, wrote: true, message: 'Opgaven er tildelt.' }
    : { success: false, wrote: false, message: updated.error ?? 'Opgaven blev ikke tildelt.' }
}

async function confirmNote(
  ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>,
  proposal: Extract<CrmProposal, { kind: 'add_note' }>,
): Promise<{ success: boolean; wrote: boolean; message: string }> {
  let customerId: string | null = null
  let matches = 0
  if (proposal.scope === 'case') {
    const found = await visibleCase(ctx.supabase, proposal.caseNumber)
    if (found.error) return { success: false, wrote: false, message: found.error }
    matches = found.rows.length
    customerId = found.rows.length === 1 ? found.rows[0].customer_id : null
    if (found.rows.length === 1 && !customerId) return { success: false, wrote: false, message: 'Sagen har ingen kunde. Intet er gemt.' }
  } else {
    const { data, error } = await ctx.supabase.from('customers').select('id, company_name').or(orIlikeContains(['company_name', 'contact_person'], proposal.customerName)).limit(8)
    if (error) return { success: false, wrote: false, message: 'Kundesøgningen fejlede. Intet er gemt.' }
    const rows = (data ?? []) as Array<{ id: string; company_name: string }>
    const exact = rows.filter((r) => r.company_name.localeCompare(proposal.customerName, 'da', { sensitivity: 'accent' }) === 0)
    const chosen = exact.length === 1 ? exact : rows
    matches = chosen.length
    customerId = chosen.length === 1 ? chosen[0].id : null
  }
  const plan = planAssistantNote({ confirmed: true, matches: customerId ? 1 : matches, text: proposal.text })
  if (!plan.execute || !customerId) return { success: false, wrote: false, message: plan.reason }
  if (!(await userCanViewCustomer(customerId, ctx))) return { success: false, wrote: false, message: 'Du har ikke adgang til kunden. Intet er gemt.' }
  const saved = await createCustomerNote(customerId, proposal.text.trim())
  return saved.success
    ? { success: true, wrote: true, message: 'Noten er gemt på kunden.' }
    : { success: false, wrote: false, message: saved.error ?? 'Noten blev ikke gemt.' }
}

async function confirmLink(
  ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>,
  proposal: Extract<CrmProposal, { kind: 'link_mail' }>,
): Promise<{ success: boolean; wrote: boolean; message: string }> {
  const found = await visibleCase(ctx.supabase, proposal.caseNumber)
  if (found.error) return { success: false, wrote: false, message: found.error }
  const sag = found.rows.length === 1 ? found.rows[0] : null
  const mail = await ctx.supabase.from('incoming_emails').select('id, customer_id').eq('subject', proposal.subject).limit(5)
  if (mail.error) return { success: false, wrote: false, message: 'Mailen kunne ikke læses. Intet er knyttet.' }
  const rows = (mail.data ?? []) as Array<{ id: string; customer_id: string | null }>
  const same = !!sag?.customer_id && rows.length === 1 && rows[0].customer_id === sag.customer_id
  const plan = planMailLink({ confirmed: true, caseMatches: found.rows.length, mailMatches: rows.length, sameCustomer: same })
  if (!plan.execute || !sag) return { success: false, wrote: false, message: plan.reason }
  if (!(await userCanViewCustomer(sag.customer_id as string, ctx))) return { success: false, wrote: false, message: 'Du har ikke adgang til kunden. Intet er knyttet.' }
  const linked = await linkEmailToCase(rows[0].id, sag.id)
  return linked.success
    ? { success: true, wrote: true, message: 'Mailen er knyttet til sagen. Der er ikke sendt noget.' }
    : { success: false, wrote: false, message: linked.error ?? 'Mailen blev ikke knyttet.' }
}
