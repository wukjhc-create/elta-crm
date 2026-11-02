'use server'

/**
 * CRM-assistenten. Læser med brugerens klient og svarer.
 * Skriver ikke, sender ikke og godkender ikke.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
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
  planAssistantTask,
  selectOutstandingCallbacks,
  type CallbackRow,
  type PoaCaseRow,
  type PoaDocRow,
} from '@/lib/assistant/crm-questions'
import type { CommCandidate } from '@/lib/automation/comm-preview'
import { getCustomerCommunicationTimeline } from '@/lib/actions/communication-timeline'
import { orIlikeContains } from '@/lib/validations/postgrest-filter'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface CrmTaskProposal {
  kind: 'create_task'
  caseNumber: string
  assigneeName: string | null
  title: string
}

export interface CrmAnswer {
  ok: boolean
  text: string
  items: Array<{ title: string; detail: string; href: string | null }>
  sends: false
  proposal: CrmTaskProposal | null
}

function answer(ok: boolean, text: string, items: CrmAnswer['items'] = [], proposal: CrmTaskProposal | null = null): CrmAnswer {
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
  if (parsed.kind === 'help' || parsed.kind === 'unknown' || parsed.kind === 'write') {
    return answer(parsed.kind !== 'unknown', explainCrmQuestion(parsed))
  }

  const today = copenhagenParts(new Date()).date
  if (parsed.kind === 'callbacks') return callbacks(ctx.supabase, today, parsed.todayOnly)
  if (parsed.kind === 'missing_poa') return missingPoa(ctx.supabase)
  if (parsed.kind === 'history') return history(ctx.supabase, parsed.name ?? '')
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
    const res = await supabase.from('customer_documents').select('customer_id, service_case_id, document_type, description').in('customer_id', chunk).eq('document_type', 'contract').limit(1000)
    if (res.error) return answer(false, 'Dokumenterne kunne ikke læses. Ingen sag er markeret som manglende fuldmagt.')
    for (const d of (res.data ?? []) as Array<{ customer_id: string | null; service_case_id: string | null; document_type: string | null; description: string | null }>) {
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
    const people = await supabase.from('profiles').select('id, full_name').eq('is_active', true).or(orIlikeContains(['full_name'], assigneeName)).limit(8)
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
    title: resolved.title,
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
