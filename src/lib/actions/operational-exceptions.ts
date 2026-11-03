'use server'

/**
 * Driftstal til forsiden. Hvert tal er ok, skjult eller ukendt.
 * En læsefejl bliver aldrig 0. Ufaktureret arbejde ejes af dashboard-overblikket.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { casesMissingPowerOfAttorney, type PoaCaseRow, type PoaDocRow } from '@/lib/assistant/crm-questions'
import { copenhagenWeekBounds } from '@/lib/operations/planning-window'
import { readCasesWithoutNextAction } from '@/lib/operations/open-cases'
import { copenhagenDatePlusDays, copenhagenLocalToIso, copenhagenParts } from '@/lib/utils/copenhagen-time'
import { getEmployeeRateGapsAction } from '@/lib/actions/employees'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type OpCount =
  | { state: 'ok'; count: number; href: string | null; note: string | null }
  | { state: 'unknown'; href: string | null; note: string }
  | { state: 'hidden' }

export interface OperationalExceptions {
  callbacks: OpCount
  unlinkedMail: OpCount
  missingPoa: OpCount
  supplierReview: OpCount
  rateGaps: OpCount
  jobsToday: OpCount
  jobsTomorrow: OpCount
  jobsWeek: OpCount
  overdueTasks: OpCount
  casesWithoutAction: OpCount
}

async function exactCount(
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  href: string,
): Promise<OpCount> {
  try {
    const { count, error } = await run()
    if (error || count == null) return { state: 'unknown', href, note: 'Tallet kunne ikke læses.' }
    return { state: 'ok', count, href, note: null }
  } catch {
    return { state: 'unknown', href, note: 'Tallet kunne ikke læses.' }
  }
}

export async function getOperationalExceptions(): Promise<OperationalExceptions> {
  const ctx = await getAuthenticatedClientWithRole()
  const today = copenhagenParts(new Date()).date
  const week = copenhagenWeekBounds(today)
  const hidden: OpCount = { state: 'hidden' }

  const callbacks = ctx.hasPermission('customers.view')
    ? exactCount(() => ctx.supabase.from('customer_tasks').select('id', { count: 'exact', head: true }).in('auto_rule', ['assistant_missed_call', 'assistant_callback']).neq('status', 'done'), '/dashboard/cti/queue')
    : Promise.resolve(hidden)

  const unlinkedMail = ctx.hasPermission('inbox.view')
    ? exactCount(() => ctx.supabase.from('incoming_emails').select('id', { count: 'exact', head: true }).eq('is_archived', false).eq('link_status', 'linked').is('service_case_id', null), '/dashboard/mail')
    : Promise.resolve(hidden)

  const supplierReview = ctx.hasPermission('incoming_invoices.view')
    ? exactCount(() => ctx.supabase.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('requires_manual_review', true).in('status', ['received', 'awaiting_approval']), '/dashboard/incoming-invoices')
    : Promise.resolve(hidden)

  const jobsToday = exactCount(() => ctx.supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).in('status', ['planned', 'in_progress']), '/dashboard/calendar')
  const jobsTomorrow = exactCount(() => ctx.supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('scheduled_date', copenhagenDatePlusDays(1)).in('status', ['planned', 'in_progress']), '/dashboard/calendar')
  const jobsWeek = exactCount(() => ctx.supabase.from('work_orders').select('id', { count: 'exact', head: true }).gte('scheduled_date', week.start).lte('scheduled_date', week.end).in('status', ['planned', 'in_progress']), '/dashboard/calendar')
  const dayStart = copenhagenLocalToIso(today, '00:00')
  const overdueTasks = ctx.hasPermission('customers.view')
    ? exactCount(() => ctx.supabase.from('customer_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_date', dayStart), '/dashboard/tasks')
    : Promise.resolve(hidden)
  const casesWithoutAction = ctx.hasPermission('customers.view') ? casesWithoutActionCount(ctx.supabase) : Promise.resolve(hidden)

  const missingPoa = ctx.hasPermission('customers.view') ? missingPoaCount(ctx.supabase) : Promise.resolve(hidden)
  const rateGaps = ctx.hasPermission('employees.view') ? rateGapCount() : Promise.resolve(hidden)

  const [a, b, c, d, tomorrow, e, f, g, overdue, idle] = await Promise.all([callbacks, unlinkedMail, supplierReview, jobsToday, jobsTomorrow, jobsWeek, missingPoa, rateGaps, overdueTasks, casesWithoutAction])
  return { callbacks: a, unlinkedMail: b, supplierReview: c, jobsToday: d, jobsTomorrow: tomorrow, jobsWeek: e, missingPoa: f, rateGaps: g, overdueTasks: overdue, casesWithoutAction: idle }
}

async function casesWithoutActionCount(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']): Promise<OpCount> {
  const found = await readCasesWithoutNextAction(supabase)
  if (!found.ok) return { state: 'unknown', href: '/dashboard/orders', note: found.reason }
  return { state: 'ok', count: found.cases.length, href: '/dashboard/orders', note: 'Åbne sager uden ufærdig opgave og uden planlagt eller igangværende arbejdsordre.' }
}

async function missingPoaCount(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']): Promise<OpCount> {
  // Alle åbne sager i brugerens scope og alle deres kontrakt-dokumenter, side for side: et loft (før 200 sager / 1.000
  // dokumenter pr. bid) gav et for lavt tal for sager, og et afkortet dokumentsæt talte sager med fuldmagt som manglende.
  type CaseRow = { id: string; case_number: string | null; title: string; customer_id: string | null; status: string }
  type DocRow = { id: string; customer_id: string | null; service_case_id: string | null; document_type: string | null; description: string | null }
  let cases: CaseRow[]
  try {
    cases = await fetchAllRows<CaseRow>((f, t) => supabase.from('service_cases').select('id, case_number, title, customer_id, status')
      .eq('is_proposal', false).not('status', 'in', '(closed,converted,cancelled)').order('id').range(f, t))
  } catch {
    return { state: 'unknown', href: '/dashboard/orders', note: 'Sagerne kunne ikke læses.' }
  }
  try {
    const customerIds = [...new Set(cases.map((c) => c.customer_id).filter(Boolean) as string[])]
    const docs: PoaDocRow[] = []
    for (let i = 0; i < customerIds.length; i += 200) {
      const chunk = customerIds.slice(i, i + 200)
      const rows = await fetchAllRows<DocRow>((f, t) => supabase.from('customer_documents').select('id, customer_id, service_case_id, document_type, description')
        .in('customer_id', chunk).eq('document_type', 'contract').order('id').range(f, t))
      for (const d of rows) docs.push({ customerId: d.customer_id, serviceCaseId: d.service_case_id, documentType: d.document_type, description: d.description })
    }
    const rows: PoaCaseRow[] = cases.map((c) => ({ id: c.id, caseNumber: c.case_number, title: c.title, customerId: c.customer_id, status: c.status }))
    return { state: 'ok', count: casesMissingPowerOfAttorney(rows, docs).length, href: '/dashboard/assistant', note: null }
  } catch {
    return { state: 'unknown', href: '/dashboard/orders', note: 'Dokumenterne kunne ikke læses. Ingen sag tælles som manglende fuldmagt.' }
  }
}

async function rateGapCount(): Promise<OpCount> {
  try {
    const gaps = await getEmployeeRateGapsAction()
    return { state: 'ok', count: Object.keys(gaps).length, href: '/dashboard/employees', note: 'Aktive medarbejdere uden timepris eller kostpris. Ingen beløb.' }
  } catch {
    return { state: 'unknown', href: '/dashboard/employees', note: 'Satserne kunne ikke læses. Det tælles ikke som nul.' }
  }
}
