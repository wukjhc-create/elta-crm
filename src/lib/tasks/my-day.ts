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

export interface MyDayReminder {
  id: string
  title: string
  due_at: string
  status: string
}

/** Egne personlige påmindelser (ingen kunde). Samme danske dag som opgaverne. Udførte er ude. */
export function splitMyDayReminders(
  reminders: MyDayReminder[],
  now: Date = new Date(),
): { overdue: MyDayReminder[]; today: MyDayReminder[] } {
  const today = copenhagenParts(now).date
  const open = reminders.filter((r) => r.status !== 'done' && r.due_at)
  const dayOf = (iso: string) => copenhagenParts(iso).date
  const byDue = (a: MyDayReminder, b: MyDayReminder) => (a.due_at < b.due_at ? -1 : a.due_at > b.due_at ? 1 : 0)
  return {
    overdue: open.filter((r) => dayOf(r.due_at) < today).sort(byDue),
    today: open.filter((r) => dayOf(r.due_at) === today).sort(byDue),
  }
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
