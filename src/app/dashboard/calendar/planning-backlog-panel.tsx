/**
 * N48: "Mangler planlægning" over kalenderen — aktive sager uden arbejdsordre eller med arbejdsordrer uden dato/montør.
 * Server-komponent (data hentes kun for work_orders.plan); hver række linker direkte til sagens Planlægning-fane.
 */
import Link from 'next/link'
import { ClipboardList, Clock } from 'lucide-react'
import type { JobWithoutTimeItem, PlanningBacklogItem } from '@/lib/actions/planning-backlog'

const REASON: Record<PlanningBacklogItem['reason'], string> = {
  no_work_order: 'Ingen arbejdsordre',
  missing_date: 'Arbejdsordre uden dato',
  missing_employee: 'Arbejdsordre uden montør',
}

export function PlanningBacklogPanel({ items, total }: { items: PlanningBacklogItem[]; total: number }) {
  if (total === 0) return null
  return (
    <details className="bg-white rounded-lg border mb-4" data-testid="planning-backlog" open={total <= 5}>
      <summary className="cursor-pointer select-none px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <ClipboardList className="w-4 h-4 text-amber-600" />
        Mangler planlægning
        <span className="ml-1 inline-block min-w-[22px] text-center text-xs px-1.5 rounded bg-amber-100 text-amber-800" data-testid="planning-backlog-count">{total}</span>
      </summary>
      <ul className="divide-y text-sm px-4 pb-3">
        {items.map((it) => (
          <li key={it.case_id} className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/dashboard/orders/${it.case_id}?tab=planlaegning`} className="font-medium text-gray-900 hover:underline truncate block" data-testid="planning-backlog-item">
                {it.case_number ? `${it.case_number} · ` : ''}{it.title}
              </Link>
              <div className="text-xs text-gray-500 truncate">{it.customer_name ?? '—'}</div>
            </div>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200">{REASON[it.reason]}</span>
          </li>
        ))}
      </ul>
      {total > items.length && <p className="px-4 pb-3 text-xs text-gray-500">Viser {items.length} af {total} (ældste først).</p>}
    </details>
  )
}

/**
 * N62: "Job uden registreret tid" — overståede arbejdsordrer (seneste 60 dage) med montør, men uden timer.
 * Linker til sagens Planlægning / Timer-fane, hvor tiden kan registreres eller jobbet annulleres.
 */
export function JobsWithoutTimePanel({ items, total }: { items: JobWithoutTimeItem[]; total: number }) {
  if (total === 0) return null
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
  return (
    <details className="bg-white rounded-lg border mb-4" data-testid="jobs-without-time" open={total <= 5}>
      <summary className="cursor-pointer select-none px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Clock className="w-4 h-4 text-rose-600" />
        Job uden registreret tid
        <span className="ml-1 inline-block min-w-[22px] text-center text-xs px-1.5 rounded bg-rose-100 text-rose-800" data-testid="jobs-without-time-count">{total}</span>
      </summary>
      <ul className="divide-y text-sm px-4 pb-3">
        {items.map((it) => (
          <li key={it.work_order_id} className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {it.case_id ? (
                <Link href={`/dashboard/orders/${it.case_id}?tab=planlaegning`} className="font-medium text-gray-900 hover:underline truncate block" data-testid="jobs-without-time-item">
                  {it.case_number ? `${it.case_number} · ` : ''}{it.title}
                </Link>
              ) : (
                <span className="font-medium text-gray-900 truncate block" data-testid="jobs-without-time-item">{it.title}</span>
              )}
              <div className="text-xs text-gray-500 truncate">{it.employee_name ?? 'Ukendt montør'} · {fmt(it.scheduled_date)}</div>
            </div>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-rose-50 text-rose-800 ring-1 ring-rose-200">
              {it.status === 'done' ? 'Afsluttet uden tid' : `${it.days_ago} d siden`}
            </span>
          </li>
        ))}
      </ul>
      {total > items.length && <p className="px-4 pb-3 text-xs text-gray-500">Viser {items.length} af {total} (ældste først).</p>}
    </details>
  )
}
