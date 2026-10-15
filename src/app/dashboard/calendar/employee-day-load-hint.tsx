'use client'

/**
 * Fokus E 2026-10-15: dobbeltbooking-varsel i planlægningsdialogerne — viser hvor mange aktive job montøren allerede
 * har på datoen, før der gemmes. Kun information (blokerer ikke).
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getEmployeeDayLoadAction, type EmployeeDayLoad } from '@/lib/actions/work-orders'

export function EmployeeDayLoadHint({ employeeId, date, excludeWorkOrderId }: { employeeId: string; date: string; excludeWorkOrderId?: string | null }) {
  const [load, setLoad] = useState<EmployeeDayLoad | null>(null)

  useEffect(() => {
    let alive = true
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setLoad(null); return }
    getEmployeeDayLoadAction(employeeId, date, excludeWorkOrderId ?? null)
      .then((r) => { if (alive) setLoad(r.success && r.data ? r.data : null) })
      .catch(() => { if (alive) setLoad(null) })
    return () => { alive = false }
  }, [employeeId, date, excludeWorkOrderId])

  if (!load || load.count === 0) return null
  return (
    <div className="mt-1 rounded bg-amber-50 ring-1 ring-amber-200 px-2 py-1.5 text-xs text-amber-900 flex gap-1.5" role="status" data-testid="employee-day-load">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>
        Medarbejderen har allerede {load.count} job denne dag: {load.titles.slice(0, 3).join(', ')}{load.count > 3 ? ` m.fl.` : ''}
      </span>
    </div>
  )
}
