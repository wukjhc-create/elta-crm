/**
 * "Mine job" — montørens dagsoverblik på landingssiden (/dashboard/tasks). Henter kun brugerens egne arbejdsordrer
 * (scope i listWorkOrdersByDateRange). Ikke-afsluttede job fra de seneste 14 dage vises som "Ikke afsluttet".
 * Hvert job linker direkte til sagens Planlægning/Timer-fane (afslut + timer + fotos).
 */
import Link from 'next/link'
import { CalendarCheck, ChevronRight, AlertTriangle, Navigation } from 'lucide-react'
import { listWorkOrdersByDateRange, type WorkOrderForCalendar } from '@/lib/actions/work-orders'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

const STATUS: Record<string, string> = { planned: 'Planlagt', in_progress: 'I gang' }

export async function MyJobsCard() {
  const today = copenhagenParts(new Date()).date
  const res = await listWorkOrdersByDateRange(shiftDay(today, -14), shiftDay(today, 7))
  if (!res.success) return null
  const open = (res.data ?? []).filter((w) => w.status === 'planned' || w.status === 'in_progress')
  const overdue = open.filter((w) => w.scheduled_date && w.scheduled_date < today)
  const todays = open.filter((w) => w.scheduled_date === today)
  const upcoming = open.filter((w) => w.scheduled_date && w.scheduled_date > today)

  return (
    <section className="bg-white rounded-lg border p-4 sm:p-5 mb-6" data-testid="my-jobs-card">
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck className="w-5 h-5 text-emerald-700" />
        <h2 className="font-semibold">Mine job</h2>
        <Link href="/dashboard/calendar" className="ml-auto text-xs text-emerald-700 hover:underline">Kalender</Link>
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen planlagte job de næste 7 dage.</p>
      ) : (
        <div className="space-y-4">
          <JobGroup title="Ikke afsluttet" jobs={overdue} warn />
          <JobGroup title={`I dag · ${fmtDay(today)}`} jobs={todays} emptyText="Ingen job i dag." />
          <JobGroup title="Kommende" jobs={upcoming} />
        </div>
      )}
    </section>
  )
}

function JobGroup({ title, jobs, warn, emptyText }: { title: string; jobs: WorkOrderForCalendar[]; warn?: boolean; emptyText?: string }) {
  if (jobs.length === 0 && !emptyText) return null
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1 ${warn ? 'text-amber-700' : 'text-gray-500'}`}>
        {warn && <AlertTriangle className="w-3.5 h-3.5" />}
        {title} {jobs.length > 0 && <span className="font-normal">({jobs.length})</span>}
      </h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <ul className="divide-y rounded-md ring-1 ring-gray-100">
          {jobs.map((w) => (
            <li key={w.id} className="flex items-stretch">
              <Link
                href={w.case ? `/dashboard/orders/${w.case.id}?tab=planlaegning` : '/dashboard/calendar'}
                className="flex flex-1 min-w-0 items-center gap-3 px-3 py-3 hover:bg-gray-50 active:bg-gray-100"
                data-testid="my-job"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{w.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {w.scheduled_date ? fmtDay(w.scheduled_date) : 'Uden dato'}
                    {w.case ? ` · ${w.case.case_number}` : ''}
                    {w.case?.customer_name ? ` · ${w.case.customer_name}` : ''}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${w.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                  {STATUS[w.status] ?? w.status}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              {/* N49: navigation direkte fra dagsoversigten (stor trykflade til mobil) */}
              {w.case?.address && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([w.case.address, w.case.postal_code, w.case.city].filter(Boolean).join(', '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex flex-col items-center justify-center px-3 text-emerald-700 hover:bg-emerald-50 border-l text-[11px]"
                  data-testid="my-job-navigate"
                  aria-label={`Navigér til ${w.case.address}`}
                >
                  <Navigation className="w-4 h-4" />
                  Navigér
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
