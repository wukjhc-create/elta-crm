'use server'

/**
 * CRM-assistenten. Læser med brugerens klient og svarer.
 * Skriver ikke, sender ikke og godkender ikke.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import {
  casesMissingPowerOfAttorney,
  copenhagenDate,
  explainCrmQuestion,
  followUpPreview,
  historyLines,
  interpretCrmQuestion,
  selectOutstandingCallbacks,
  type CallbackRow,
  type PoaCaseRow,
  type PoaDocRow,
} from '@/lib/assistant/crm-questions'
import type { CommCandidate } from '@/lib/automation/comm-preview'
import { getCustomerCommunicationTimeline } from '@/lib/actions/communication-timeline'
import { orIlikeContains } from '@/lib/validations/postgrest-filter'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface CrmAnswer {
  ok: boolean
  text: string
  items: Array<{ title: string; detail: string; href: string | null }>
  sends: false
}

function answer(ok: boolean, text: string, items: CrmAnswer['items'] = []): CrmAnswer {
  return { ok, text, items, sends: false }
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
