/**
 * "Mine timer" — montørens egne timer i denne uge (dansk kalender, man–søn) på landingssiden. Viser timer pr. dag,
 * ugens total og registreringerne. Åben timer fremhæves (tæller først når den stoppes).
 */

import Link from 'next/link'
import { Clock, AlertTriangle } from 'lucide-react'
import { getMyWeekHoursAction } from '@/lib/actions/my-hours'

const fmtH = (n: number) => n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('da-DK', { weekday: 'short', timeZone: 'UTC' })
const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export async function MyHoursCard() {
  const res = await getMyWeekHoursAction(0)
  if (!res.ok || !res.linked) return null
  const { week } = res
  return (
    <section className="bg-white rounded-lg border p-4 sm:p-5 mb-6" data-testid="my-hours-card">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-5 h-5 text-emerald-700" />
        <h2 className="font-semibold">Mine timer</h2>
        <span className="text-xs text-gray-500">uge {dateLabel(week.weekStart)} – {dateLabel(week.weekEnd)}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums" data-testid="my-hours-total">{fmtH(week.total)} t</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-3">
        {week.days.map((d) => (
          <div key={d.date} className={`rounded px-1 py-1.5 ${d.hours > 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-50 text-gray-400'}`}>
            <div className="text-[10px] uppercase tracking-wide">{dayLabel(d.date)}</div>
            <div className="text-sm font-medium tabular-nums">{d.hours > 0 ? fmtH(d.hours) : '–'}</div>
          </div>
        ))}
      </div>
      {week.openTimer && (
        <p className="text-xs text-amber-800 flex items-center gap-1 mb-2">
          <AlertTriangle className="w-3.5 h-3.5" /> Du har en kørende timer — den tæller med når den stoppes.
        </p>
      )}
      {week.entries.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen timer registreret i denne uge.</p>
      ) : (
        <ul className="divide-y text-sm">
          {week.entries.slice(0, 12).map((e) => (
            <li key={e.id} className="py-1.5 flex items-center gap-2">
              <span className="text-xs text-gray-500 w-20 shrink-0">{dayLabel(e.date)} {e.clock}</span>
              <span className="truncate">
                {e.case_number ? <span className="font-mono text-xs text-gray-600 mr-1">{e.case_number}</span> : null}
                {e.work_order_title ?? e.case_title ?? e.description ?? 'Timer'}
              </span>
              <span className="ml-auto tabular-nums font-medium">{e.end_time ? `${fmtH(e.hoursNum)} t` : 'kører'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-right">
        <Link href="/dashboard/calendar" className="text-xs text-emerald-700 hover:underline">Kalender</Link>
      </div>
    </section>
  )
}
