import Link from 'next/link'
import { AlertCircle, Calendar } from 'lucide-react'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import type { MyDayTask } from '@/lib/tasks/my-day'

function when(iso: string, withClock: boolean): string {
  const p = copenhagenParts(iso)
  const [y, m, d] = p.date.split('-')
  const date = `${Number(d)}/${Number(m)}-${y}`
  return withClock ? `${date} kl. ${p.clock}` : date
}

function List({
  title,
  rows,
  testId,
  empty,
  warn,
}: {
  title: string
  rows: MyDayTask[]
  testId: string
  empty: string
  warn?: boolean
}) {
  return (
    <div className="mb-4 last:mb-0" data-testid={testId}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1 ${warn ? 'text-red-700' : 'text-gray-500'}`}>
        {warn ? <AlertCircle className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
        {title} {rows.length > 0 && <span className="font-normal">({rows.length})</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md ring-1 ring-gray-100">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/dashboard/tasks?taskId=${t.id}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50"
                data-testid="my-day-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{t.title}</span>
                  {t.customer_name && <span className="block text-xs text-gray-500 truncate">{t.customer_name}</span>}
                </span>
                <span className={`text-xs shrink-0 ${warn ? 'text-red-700' : 'text-gray-600'}`}>
                  {when(t.due_date!, !warn)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MyDayTasks({ overdue, today }: { overdue: MyDayTask[]; today: MyDayTask[] }) {
  return (
    <div data-testid="my-day-tasks">
      <List title="Mine forfaldne" rows={overdue} testId="my-day-overdue" empty="Ingen forfaldne opgaver." warn />
      <List title="I dag" rows={today} testId="my-day-today" empty="Ingen opgaver i dag." />
    </div>
  )
}
