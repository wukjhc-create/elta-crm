/**
 * Åbne sager uden næste handling: ingen ufærdig opgave og ingen planlagt eller igangværende arbejdsordre.
 * En læsefejl er ikke en tom liste.
 *
 * Sagerne læses med brugerens klient (RLS afgør, hvilke sager brugeren ser). Opgaver og arbejdsordrer læses med den
 * interne klient, kun for de sager: RLS skjuler andres arbejdsordrer og opgaver for montør og salg, og en skjult
 * arbejdsordre er stadig en næste handling. Kun sags-id'er bruges; intet fra de skjulte rækker returneres.
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'

type Reader = { from: (table: string) => any }

const IN_CHUNK_SIZE = 200

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

export async function readCasesWithoutNextAction(
  visible: Reader,
  internal: () => Reader,
): Promise<{ ok: true; cases: OpenCaseRef[] } | { ok: false; reason: string }> {
  try {
    const cases = await fetchAllRows<{ id: string; case_number: string | null; title: string | null }>((from, to) =>
      visible.from('service_cases').select('id, case_number, title').eq('is_proposal', false).not('status', 'in', '(closed,converted,cancelled)').order('id').range(from, to))
    const ids = cases.map((row) => row.id)
    const db = internal()
    // I bidder (.in()-grænsen) og side for side (1.000-loftet): en afkortet liste ville melde travle sager som tomme
    const tasks: Array<{ service_case_id: string | null }> = []
    const orders: Array<{ case_id: string | null }> = []
    for (let k = 0; k < ids.length; k += IN_CHUNK_SIZE) {
      const chunk = ids.slice(k, k + IN_CHUNK_SIZE)
      tasks.push(...await fetchAllRows<{ id: string; service_case_id: string | null }>((from, to) =>
        db.from('customer_tasks').select('id, service_case_id').in('service_case_id', chunk).neq('status', 'done').order('id').range(from, to)))
      orders.push(...await fetchAllRows<{ id: string; case_id: string | null }>((from, to) =>
        db.from('work_orders').select('id, case_id').in('case_id', chunk).in('status', ['planned', 'in_progress']).order('id').range(from, to)))
    }
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
