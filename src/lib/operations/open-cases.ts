/**
 * Åbne sager uden næste handling: ingen ufærdig opgave og ingen planlagt eller igangværende arbejdsordre.
 * En læsefejl er ikke en tom liste.
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'

type Reader = { from: (table: string) => any }

export interface OpenCaseRef {
  id: string
  caseNumber: string | null
  title: string | null
}

export function casesWithoutNextAction(
  cases: OpenCaseRef[],
  taskCaseIds: Array<string | null>,
  workOrderCaseIds: Array<string | null>,
): OpenCaseRef[] {
  const busy = new Set<string>()
  for (const id of taskCaseIds) if (id) busy.add(id)
  for (const id of workOrderCaseIds) if (id) busy.add(id)
  return cases.filter((row) => !busy.has(row.id))
}

export async function readCasesWithoutNextAction(supabase: Reader): Promise<{ ok: true; cases: OpenCaseRef[] } | { ok: false; reason: string }> {
  try {
    const cases = await fetchAllRows<{ id: string; case_number: string | null; title: string | null }>((from, to) =>
      supabase.from('service_cases').select('id, case_number, title').eq('is_proposal', false).not('status', 'in', '(closed,converted,cancelled)').order('id').range(from, to))
    const tasks = await fetchAllRows<{ id: string; service_case_id: string | null }>((from, to) =>
      supabase.from('customer_tasks').select('id, service_case_id').neq('status', 'done').order('id').range(from, to))
    const orders = await fetchAllRows<{ id: string; case_id: string | null }>((from, to) =>
      supabase.from('work_orders').select('id, case_id').in('status', ['planned', 'in_progress']).order('id').range(from, to))
    return {
      ok: true,
      cases: casesWithoutNextAction(
        cases.map((row) => ({ id: row.id, caseNumber: row.case_number, title: row.title })),
        tasks.map((row) => row.service_case_id),
        orders.map((row) => row.case_id),
      ),
    }
  } catch {
    return { ok: false, reason: 'Sagerne kunne ikke læses. Det betyder ikke, at der er nul.' }
  }
}
