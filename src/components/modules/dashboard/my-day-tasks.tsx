import Link from 'next/link'
import { AlertCircle, Calendar } from 'lucide-react'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import type { MyDayReminder, MyDayTask } from '@/lib/tasks/my-day'

function when(iso: string, withClock: boolean): string {
  const p = copenhagenParts(iso)
  const [y, m, d] = p.date.split('-')
  const date = `${Number(d)}/${Number(m)}-${y}`
  return withClock ? `${date} kl. ${p.clock}` : date
}

interface Row {
  id: string
  title: string
  subtitle: string
  at: string
  href: string
  kind: 'task' | 'reminder'
}

function taskRows(tasks: MyDayTask[]): Row[] {
  return tasks.map((task) => ({
    id: `task-${task.id}`,
    title: task.title,
    subtitle: task.customer_name,
    at: task.due_date!,
    href: `/dashboard/tasks?taskId=${task.id}`,
    kind: 'task',
  }))
}

function reminderRows(reminders: MyDayReminder[]): Row[] {
  return reminders.map((reminder) => ({
    id: `reminder-${reminder.id}`,
    title: reminder.title,
    subtitle: 'Påmindelse',
    at: reminder.due_at,
    href: '/dashboard/tasks#personal-reminders',
    kind: 'reminder',
  }))
}

function byWhen(a: Row, b: Row): number {
  const left = copenhagenParts(a.at)
  const right = copenhagenParts(b.at)
  const ak = left.date + left.clock
  const bk = right.date + right.clock
  return ak < bk ? -1 : ak > bk ? 1 : 0
}

function List({
  title,
  rows,
  testId,
  empty,
  warn,
  suppressEmpty,
}: {
  title: string
  rows: Row[]
  testId: string
  empty: string
  warn?: boolean
  suppressEmpty?: boolean
}) {
  return (
    <div className="mb-4 last:mb-0" data-testid={testId}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1 ${warn ? 'text-red-700' : 'text-gray-500'}`}>
        {warn ? <AlertCircle className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
        {title} {rows.length > 0 && <span className="font-normal">({rows.length})</span>}
      </h3>
      {rows.length === 0 ? (
        suppressEmpty ? null : <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md ring-1 ring-gray-100">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50"
                data-testid="my-day-row"
                data-kind={row.kind}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium break-words">{row.title}</span>
                  {row.subtitle && <span className="block text-xs text-gray-500 break-words">{row.subtitle}</span>}
                </span>
                <span className={`text-xs shrink-0 ${warn ? 'text-red-700' : 'text-gray-600'}`}>
                  {when(row.at, !warn)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MyDayTasks({
  overdue,
  today,
  reminderOverdue = [],
  reminderToday = [],
  loadError = null,
}: {
  overdue: MyDayTask[]
  today: MyDayTask[]
  reminderOverdue?: MyDayReminder[]
  reminderToday?: MyDayReminder[]
  /** Sat når opgavehentningen fejlede. Tomme lister må ikke ligne "ingen opgaver". */
  loadError?: string | null
}) {
  const failed = !!loadError
  return (
    <div data-testid="my-day-tasks">
      {failed ? (
        <p className="text-sm text-red-700 mb-3" data-testid="my-day-load-error">
          {loadError}. Det tælles ikke som ingen opgaver.
        </p>
      ) : null}
      <List
        title="Mine forfaldne"
        rows={[...taskRows(overdue), ...reminderRows(reminderOverdue)].sort(byWhen)}
        testId="my-day-overdue"
        empty="Ingen forfaldne opgaver."
        warn
        suppressEmpty={failed}
      />
      <List
        title="I dag"
        rows={[...taskRows(today), ...reminderRows(reminderToday)].sort(byWhen)}
        testId="my-day-today"
        empty="Ingen opgaver i dag."
        suppressEmpty={failed}
      />
    </div>
  )
}
