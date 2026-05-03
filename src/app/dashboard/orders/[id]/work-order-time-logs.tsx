'use client'

/**
 * Sprint 4C — time_logs UI for a single work_order.
 *
 * Renders inside OrderPlanningTab, collapsible, with:
 *  - List of existing time_logs (most recent first)
 *  - Inline "Registrér timer" form (date, employee, start, end OR hours,
 *    description, billable)
 *  - Total hours + total cost_amount summed for this work_order
 *
 * Cost display uses the trigger-computed cost_amount (DKK). When
 *  cost_amount is null (employee has no compensation set yet), shows
 *  "—" and a footer note.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  listTimeLogsForWorkOrder,
  createTimeLog,
  type TimeLogWithEmployee,
} from '@/lib/actions/time-logs'
import { getEmployeesForOrderSelect } from '@/lib/actions/service-cases'

const fmtAmount = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK',
        maximumFractionDigits: 0,
      }).format(Number(n))

const fmtHours = (n: number | null | undefined) =>
  n == null
    ? '—'
    : `${Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} t`

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtTime = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function WorkOrderTimeLogs({
  workOrderId,
  defaultEmployeeId,
  onChange,
}: {
  workOrderId: string
  defaultEmployeeId?: string | null
  /** Called after a successful create so parent can refresh totals */
  onChange?: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [logs, setLogs] = useState<TimeLogWithEmployee[] | null>(null)
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(today())
  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId ?? '')
  const [startClock, setStartClock] = useState('08:00')
  const [endClock, setEndClock] = useState('')
  const [hoursStr, setHoursStr] = useState('')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(true)

  const reload = async () => {
    const [logsRes, empRes] = await Promise.all([
      listTimeLogsForWorkOrder(workOrderId),
      getEmployeesForOrderSelect(),
    ])
    if (logsRes.success && logsRes.data) setLogs(logsRes.data)
    else if (!logsRes.success) setError(logsRes.error || 'Kunne ikke hente timer')
    if (empRes.success && empRes.data) setEmployees(empRes.data)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId])

  const resetForm = () => {
    setDate(today())
    setEmployeeId(defaultEmployeeId ?? '')
    setStartClock('08:00')
    setEndClock('')
    setHoursStr('')
    setDescription('')
    setBillable(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!employeeId) {
      setError('Vælg en medarbejder')
      return
    }

    const hoursParsed = hoursStr.trim().length > 0
      ? Number(hoursStr.replace(',', '.'))
      : null

    if (!endClock && (hoursParsed == null || !Number.isFinite(hoursParsed) || hoursParsed <= 0)) {
      setError('Angiv enten antal timer eller sluttid')
      return
    }

    setIsWorking(true)
    const res = await createTimeLog({
      work_order_id: workOrderId,
      employee_id: employeeId,
      date,
      start_clock: startClock,
      end_clock: endClock || null,
      hours: hoursParsed,
      description,
      billable,
    })
    setIsWorking(false)

    if (!res.success) {
      setError(res.error || 'Kunne ikke gemme timer')
      return
    }
    setShowForm(false)
    resetForm()
    await reload()
    onChange?.()
    startTransition(() => router.refresh())
  }

  if (logs === null) {
    return <div className="text-xs text-gray-500 py-2">Henter timer…</div>
  }

  const totalHours = logs.reduce((s, l) => s + (l.hours ?? 0), 0)
  const totalCost = logs.reduce((s, l) => s + (l.cost_amount ?? 0), 0)
  const totalSale = logs.reduce(
    (s, l) =>
      s +
      (l.hours != null && l.employee?.hourly_rate != null
        ? Number(l.hours) * Number(l.employee.hourly_rate)
        : 0),
    0
  )
  const totalDB = totalSale - totalCost
  const hasMissingCost = logs.some((l) => l.hours != null && l.cost_amount == null)
  const hasMissingSale = logs.some(
    (l) => l.hours != null && (l.employee?.hourly_rate == null)
  )

  const saleFor = (l: TimeLogWithEmployee): number | null =>
    l.hours != null && l.employee?.hourly_rate != null
      ? Number(l.hours) * Number(l.employee.hourly_rate)
      : null

  const dbFor = (l: TimeLogWithEmployee): number | null => {
    const sale = saleFor(l)
    if (sale == null || l.cost_amount == null) return null
    return sale - Number(l.cost_amount)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700">
          Timer ({logs.length})
          {logs.length > 0 && (
            <span className="ml-2 text-gray-500 font-normal">
              · {fmtHours(totalHours)}
              {totalCost > 0 && ` · kost ${fmtAmount(totalCost)}`}
              {totalSale > 0 && ` · salg ${fmtAmount(totalSale)}`}
              {totalSale > 0 && totalCost > 0 && (
                <>
                  {' · '}
                  <span className={totalDB >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                    DB {fmtAmount(totalDB)}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs px-2 py-1 border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50"
          >
            + Registrér timer
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 ring-1 ring-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <form
          onSubmit={onSubmit}
          className="bg-emerald-50/50 ring-1 ring-emerald-200 rounded p-3 space-y-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Dato">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isWorking}
                required
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </Field>

            <Field label="Medarbejder">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={isWorking}
                required
                className="w-full px-2 py-1 border rounded text-sm bg-white"
              >
                <option value="">— vælg —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Start (HH:mm)">
              <input
                type="time"
                value={startClock}
                onChange={(e) => setStartClock(e.target.value)}
                disabled={isWorking}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </Field>

            <Field label="Slut ELLER timer">
              <div className="flex gap-1">
                <input
                  type="time"
                  value={endClock}
                  onChange={(e) => {
                    setEndClock(e.target.value)
                    if (e.target.value) setHoursStr('')
                  }}
                  disabled={isWorking}
                  placeholder="HH:mm"
                  className="w-1/2 px-2 py-1 border rounded text-sm"
                />
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={hoursStr}
                  onChange={(e) => {
                    setHoursStr(e.target.value)
                    if (e.target.value) setEndClock('')
                  }}
                  disabled={isWorking}
                  placeholder="t"
                  className="w-1/2 px-2 py-1 border rounded text-sm"
                />
              </div>
            </Field>
          </div>

          <Field label="Beskrivelse (valgfri)">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isWorking}
              placeholder="Hvad blev der lavet?"
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </Field>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                disabled={isWorking}
                className="rounded border-gray-300"
              />
              Fakturerbar
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                  setError(null)
                }}
                disabled={isWorking}
                className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
              >
                Annullér
              </button>
              <button
                type="submit"
                disabled={isWorking}
                className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {isWorking ? 'Gemmer…' : 'Gem timer'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Time-logs list */}
      {logs.length === 0 ? (
        <div className="text-xs text-gray-400 py-2 italic">
          Ingen timer registreret på denne arbejdsordre endnu.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1 pr-2">Dato</th>
                <th className="py-1 pr-2">Medarbejder</th>
                <th className="py-1 pr-2">Periode</th>
                <th className="py-1 pr-2 text-right">Timer</th>
                <th className="py-1 pr-2 text-right">Intern kost</th>
                <th className="py-1 pr-2 text-right">Salgspris</th>
                <th className="py-1 pr-2 text-right">DB</th>
                <th className="py-1 pr-2">Beskrivelse</th>
                <th className="py-1 pr-2">Fak.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l) => {
                const sale = saleFor(l)
                const db = dbFor(l)
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(l.start_time)}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {l.employee?.name ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-1 pr-2 whitespace-nowrap text-gray-500">
                      {fmtTime(l.start_time)}
                      {l.end_time && ` → ${fmtTime(l.end_time)}`}
                      {!l.end_time && (
                        <span className="ml-1 text-amber-600 font-medium">(åben)</span>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtHours(l.hours)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {l.cost_amount == null && l.hours != null ? (
                        <span className="text-amber-600" title="Medarbejder mangler kostpris">—</span>
                      ) : (
                        fmtAmount(l.cost_amount)
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {sale == null && l.hours != null ? (
                        <span className="text-amber-600" title="Medarbejder mangler salgspris">—</span>
                      ) : (
                        fmtAmount(sale)
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {db == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={db >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                          {fmtAmount(db)}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-gray-600 max-w-[200px] truncate" title={l.description ?? ''}>
                      {l.description ?? ''}
                    </td>
                    <td className="py-1 pr-2">
                      {l.billable ? (
                        <span className="text-emerald-700">✓</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                      {l.invoice_line_id && (
                        <span
                          className="ml-1 text-[10px] uppercase bg-purple-100 text-purple-800 px-1 py-0.5 rounded"
                          title="Faktureret — kan ikke ændres"
                        >
                          F
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td colSpan={3} className="pt-1 pr-2 text-right text-gray-700">
                  Total:
                </td>
                <td className="pt-1 pr-2 text-right tabular-nums">{fmtHours(totalHours)}</td>
                <td className="pt-1 pr-2 text-right tabular-nums">{fmtAmount(totalCost)}</td>
                <td className="pt-1 pr-2 text-right tabular-nums">
                  {totalSale > 0 ? fmtAmount(totalSale) : '—'}
                </td>
                <td className="pt-1 pr-2 text-right tabular-nums">
                  {totalSale > 0 && totalCost > 0 ? (
                    <span className={totalDB >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                      {fmtAmount(totalDB)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {(hasMissingCost || hasMissingSale) && (
        <p className="text-[10px] text-amber-700">
          ⚠ Økonomiberegning ufuldstændig — én eller flere medarbejdere
          mangler {hasMissingCost && hasMissingSale
            ? 'kostpris og/eller salgspris'
            : hasMissingCost
            ? 'kostpris'
            : 'salgspris'}.
          Sæt satser på medarbejderens detaljeside under "Rediger" → "Satser
          og økonomi".
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] uppercase tracking-wide text-gray-600">{label}</label>
      {children}
    </div>
  )
}
