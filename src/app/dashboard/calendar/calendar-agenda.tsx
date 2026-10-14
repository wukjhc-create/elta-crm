import Link from 'next/link'
import type { AgendaDay, AgendaKind } from '@/lib/calendar/agenda'

const KIND_LABEL: Record<AgendaKind, string> = {
  inspection: 'Besigtigelse',
  callback: 'Opkald',
  reminder: 'Påmindelse',
}

const KIND_CLASS: Record<AgendaKind, string> = {
  inspection: 'bg-sky-50 text-sky-800 ring-sky-200',
  callback: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  reminder: 'bg-amber-50 text-amber-800 ring-amber-200',
}

function dayLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Besigtigelser, assistent-opkald og egne påmindelser oven på arbejdsordre-planen.
 * Samme indhold som månedsvisningen, afgrænset til de viste datoer.
 */
export function CalendarAgenda({ days }: { days: AgendaDay[] }) {
  const count = days.reduce((n, day) => n + day.items.length, 0)
  return (
    <section className="bg-white rounded-lg ring-1 ring-gray-200 p-3" data-testid="calendar-agenda">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-800">Aftaler og påmindelser</h2>
        <p className="text-xs text-gray-500">{count === 0 ? 'Ingen i perioden' : `${count} i perioden`}</p>
      </div>
      <div className={days.length > 1 ? 'grid grid-cols-1 md:grid-cols-7 gap-2' : 'space-y-1'}>
        {days.map((day) => (
          <div key={day.date} data-testid="calendar-agenda-day" data-date={day.date}>
            {days.length > 1 && (
              <p className="text-xs font-medium text-gray-500 mb-1 capitalize">{dayLabel(day.date)}</p>
            )}
            {day.items.length === 0 ? (
              <p className="text-xs text-gray-400">{days.length > 1 ? '—' : 'Ingen besigtigelser, opkald eller påmindelser denne dag.'}</p>
            ) : (
              <ul className="space-y-1">
                {day.items.map((item) => {
                  const done = item.status === 'done'
                  const href = item.kind === 'reminder'
                    ? '/dashboard/tasks'
                    : item.customerId
                      ? `/dashboard/customers/${item.customerId}`
                      : null
                  const label = item.customerName || item.title
                  return (
                    <li key={item.id} data-testid="calendar-agenda-item" data-kind={item.kind} className={done ? 'opacity-60' : ''}>
                      <div className="flex items-start gap-1.5">
                        <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded ring-1 ${KIND_CLASS[item.kind]}`}>
                          {KIND_LABEL[item.kind]}
                        </span>
                        <div className="min-w-0 text-sm">
                          <p className={done ? 'text-gray-400 line-through' : 'text-gray-900'}>
                            {item.clock ? <span className="text-gray-500">{item.clock} </span> : null}
                            {href ? (
                              <Link href={href} className="hover:underline">{label}</Link>
                            ) : label}
                          </p>
                          {item.customerName && item.customerName !== item.title && (
                            <p className="text-xs text-gray-500 truncate">{item.title}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
