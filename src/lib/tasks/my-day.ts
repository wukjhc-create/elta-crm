/**
 * N29: mine forfaldne opgaver og dagens liste. Dagen er den danske kalenderdag.
 * En opgave der forfalder i dag, bliver på dagens liste resten af dagen.
 * Andre personers opgaver, udførte opgaver og opgaver uden frist er ikke med.
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface MyDayTask {
  id: string
  title: string
  assigned_to: string | null
  due_date: string | null
  status: string
  customer_name: string
}

export function splitMyDayTasks<T extends MyDayTask>(
  tasks: T[],
  userId: string,
  now: Date = new Date(),
): { overdue: T[]; today: T[] } {
  const today = copenhagenParts(now).date
  const mine = tasks.filter(
    (t) => t.assigned_to === userId && t.status !== 'done' && t.due_date,
  )
  const dayOf = (iso: string) => copenhagenParts(iso).date
  const byDue = (a: T, b: T) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0)
  return {
    overdue: mine.filter((t) => dayOf(t.due_date!) < today).sort(byDue),
    today: mine.filter((t) => dayOf(t.due_date!) === today).sort(byDue),
  }
}
