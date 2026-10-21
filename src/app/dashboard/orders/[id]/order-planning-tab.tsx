'use client'

import { ABSENCE_CONFLICT_PREFIX, isAbsenceConflict } from '@/lib/planning/absence'
import { EmployeeDayLoadHint } from '@/app/dashboard/calendar/employee-day-load-hint'
import { useEffect, useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import {
  createWorkOrderForCase,
  changeWorkOrderStatus,
  getCasePlanningBundleAction,
  deletePlannedWorkOrder,
  type WorkOrderWithEmployee,
} from '@/lib/actions/work-orders'
import { type TimeLogWithEmployee } from '@/lib/actions/time-logs'
import type { WorkOrderStatus } from '@/types/workforce.types'
import { WorkOrderTimeLogs } from './work-order-time-logs'
import { CostRevealToggle, useCostReveal } from '@/components/shared/sensitive-amounts'
import { humanizeErrorText } from '@/lib/auth/permission-text'
import { formatWorkOrderTime } from '@/lib/planning/work-order-time'

// MB-1 (mobil-review 2026-10-17): en server action der KASTER (ingen forbindelse i kælderen) efterlod formularen
// låst på "Gemmer…" — nu bliver det til en almindelig fejl med dansk besked, og indtastningerne bevares
const OFFLINE_RESULT = { success: false as const, error: 'Ingen forbindelse — dine indtastninger er bevaret, prøv igen' }
async function safeAction<T>(p: Promise<T>): Promise<T | typeof OFFLINE_RESULT> {
  try { return await p } catch { return OFFLINE_RESULT }
}

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  planned: 'Planlagt',
  in_progress: 'I gang',
  done: 'Afsluttet',
  cancelled: 'Annulleret',
}

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  planned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  done: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-700',
}

type WorkOrderCaps = Awaited<ReturnType<typeof getCasePlanningBundleAction>>['caps']
const NO_CAPS: WorkOrderCaps = { canStart: false, canComplete: false, canCancel: false, canDelete: false, canReopen: false }

const NEXT_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  planned: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: ['in_progress'], // FW-4: kun kontoret (canReopen)
  cancelled: [],
}

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const NO_LOGS: TimeLogWithEmployee[] = []

export function OrderPlanningTab({
  caseId,
  caseTitle,
  caseDefaultEmployeeId,
  canSeeCost = false,
  canSeeLaborCostDetail = false,
}: {
  caseId: string
  caseTitle: string
  caseDefaultEmployeeId?: string | null
  /** Sprint Ø2.10 — gate til intern kost / DB (economy.cost_prices). */
  canSeeCost?: boolean
  /** D50 — employees.payroll.view: kost/DB pr. timeregistrering; ellers kun sagens aggregerede kost. */
  canSeeLaborCostDetail?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // PL-3 (planlægnings-review 2026-10-14): planlægning kræver work_orders.plan — montøren fik knapper der altid fejlede
  const { role } = useUserRole()
  const canPlan = !!role && hasPermission(role, 'work_orders.plan')

  const [workOrders, setWorkOrders] = useState<WorkOrderWithEmployee[] | null>(null)
  const [caps, setCaps] = useState<WorkOrderCaps>(NO_CAPS)
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  // M-9: sagens timer + medarbejderlisten deles med alle arbejdsordre-rækker (null = ikke hentet → rækken henter selv)
  const [caseLogs, setCaseLogs] = useState<TimeLogWithEmployee[] | null>(null)
  const [sharedEmployees, setSharedEmployees] = useState<{ id: string; name: string }[] | null>(null)
  // R-3 (review 2026-10-16): stabile referencer pr. arbejdsordre (før nyt array ved hver render → barnets effekt
  // overskrev nyligt genindlæste timer med forælderens ældre øjebliksbillede)
  const logsByWo = useMemo(() => {
    const m = new Map<string, TimeLogWithEmployee[]>()
    for (const l of caseLogs ?? []) {
      const arr = m.get(l.work_order_id) ?? []
      arr.push(l)
      m.set(l.work_order_id, arr)
    }
    return m
  }, [caseLogs])
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [caseTotals, setCaseTotals] = useState<{
    hours: number
    cost: number
    sale: number
    count: number
  }>({
    hours: 0,
    cost: 0,
    sale: 0,
    count: 0,
  })

  // Inline create form state
  const [showForm, setShowForm] = useState(false)
  // PV8 shoulder-surfing: intern kost/DB (sagstotal + timeregistreringer) foldet sammen som standard
  const [costOpen, toggleCost] = useCostReveal()
  const showCost = canSeeCost && costOpen
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formEst, setFormEst] = useState('')
  const [formEmployee, setFormEmployee] = useState<string>(caseDefaultEmployeeId ?? '')
  const [formDescription, setFormDescription] = useState('')

  const reload = async () => {
    // PF3-6: ét kald i stedet for fem serielle (rettigheder, arbejdsordrer, medarbejdere, timer, kost)
    // D50: aggregeret kost fra serveren (rækkerne har ingen kost uden løn-adgang)
    const bundle = await getCasePlanningBundleAction(caseId, { withCost: canSeeCost }).catch(() => null)
    if (!bundle) { setError('Kunne ikke hente arbejdsordrer'); return }
    setCaps(bundle.caps ?? NO_CAPS)
    const woRes = bundle.workOrders
    const empRes = bundle.employees
    const logsRes = bundle.logs
    const costRes = bundle.cost
    if (woRes.success && woRes.data) setWorkOrders(woRes.data)
    else setError(woRes.error || 'Kunne ikke hente arbejdsordrer')
    if (empRes.success && empRes.data) { setEmployees(empRes.data); setSharedEmployees(empRes.data) }
    else setSharedEmployees(null)
    setCaseLogs(logsRes.success && logsRes.data ? logsRes.data : null)
    if (logsRes.success && logsRes.data) {
      // TP-2 (review 2026-10-17): kun afsluttede, ikke-afviste registreringer (samme sæt som kostprisen fra
      // getCaseLaborCostTotal); salg = frosset sale_amount (overtid) for fakturerbare, ellers timer × sats
      const logs = logsRes.data.filter((l) => (l as { approval_status?: string | null }).approval_status !== 'rejected' && (l as { end_time?: string | null }).end_time != null)
      setCaseTotals({
        count: logs.length,
        hours: logs.reduce((s, l) => s + (l.hours ?? 0), 0),
        cost: costRes?.success && costRes.data ? costRes.data.cost : logs.reduce((s, l) => s + (l.cost_amount ?? 0), 0),
        sale: logs.filter((l) => (l as { billable?: boolean | null }).billable !== false).reduce(
          (s, l) =>
            s +
            ((l as { sale_amount?: number | string | null }).sale_amount != null
              ? Number((l as { sale_amount?: number | string | null }).sale_amount)
              : l.hours != null && l.employee?.hourly_rate != null
              ? Number(l.hours) * Number(l.employee.hourly_rate)
              : 0),
          0
        ),
      })
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const resetForm = () => {
    setFormTitle('')
    setFormDate('')
    setFormStart('')
    setFormEst('')
    setFormEmployee(caseDefaultEmployeeId ?? '')
    setFormDescription('')
  }

  const onSubmit = async () => {
    setError(null)
    if (!formTitle.trim()) {
      setError('Titel er påkrævet')
      return
    }
    setIsWorking(true)
    const payload = {
      case_id: caseId,
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      scheduled_date: formDate || null,
      start_time: formStart || null,
      estimated_hours: formEst || null,
      assigned_employee_id: formEmployee || null,
    }
    let res = await safeAction(createWorkOrderForCase(payload))
    // 00228: fravær → eksplicit bekræftelse (audit-logges på serveren)
    if (!res.success && isAbsenceConflict(res.error)) {
      if (!window.confirm((res.error ?? '').slice(ABSENCE_CONFLICT_PREFIX.length).trim())) {
        setIsWorking(false)
        setError('Ikke planlagt — medarbejderen har fravær den dag')
        return
      }
      res = await safeAction(createWorkOrderForCase({ ...payload, override_absence: true }))
    }
    setIsWorking(false)
    if (!res.success) {
      setError(humanizeErrorText(res.error) || 'Kunne ikke oprette arbejdsordre')
      return
    }
    setShowForm(false)
    resetForm()
    await reload()
    startTransition(() => router.refresh())
  }

  const onChangeStatus = async (woId: string, next: WorkOrderStatus) => {
    // U-8/U-9 (pilot-sweep 2026-10-15): "Annullér" og "Afslut" er endelige — bekræft først
    if (next === 'cancelled' && !window.confirm('Annullér arbejdsordren? Det kan ikke fortrydes.')) return
    if (next === 'done' && !window.confirm('Afslut arbejdsordren? Kun kontoret kan genåbne den.')) return
    setError(null)
    setIsWorking(true)
    const res = await safeAction(changeWorkOrderStatus(woId, next))
    setIsWorking(false)
    if (!res.success) {
      setError(humanizeErrorText(res.error) || 'Kunne ikke ændre status')
      return
    }
    await reload()
    startTransition(() => router.refresh())
  }

  const onDelete = async (woId: string) => {
    if (!window.confirm('Slet denne planlagte arbejdsordre? Handlingen kan ikke fortrydes.')) return
    setError(null)
    setIsWorking(true)
    const res = await safeAction(deletePlannedWorkOrder(woId))
    setIsWorking(false)
    if (!res.success) {
      setError(humanizeErrorText(res.error) || 'Kunne ikke slette')
      return
    }
    await reload()
    startTransition(() => router.refresh())
  }

  if (workOrders === null) {
    // DE-1: en fejl (fx manglende ret) vises — før stod fanen og "hentede" for evigt
    if (error) return <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 my-4" data-testid="planning-load-error">{error}</div>
    return <div className="text-sm text-gray-500 py-6 text-center">Henter planlagte arbejdsordrer…</div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Header row with CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Planlagte arbejdsordrer</h3>
          <p className="text-xs text-gray-500">
            {workOrders.length === 0
              ? 'Ingen arbejdsordrer planlagt endnu'
              : `${workOrders.length} arbejdsordr${workOrders.length === 1 ? 'e' : 'er'} på sagen`}
          </p>
        </div>
        {!showForm && canPlan && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true)
              if (!formTitle) setFormTitle(caseTitle)
            }}
            disabled={isWorking}
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            + Planlæg medarbejder
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="bg-emerald-50/50 ring-1 ring-emerald-200 rounded-lg p-4 space-y-3">
          <div className="text-sm font-semibold text-emerald-900">Ny arbejdsordre</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-gray-600">Titel *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Fx 'El-installation dag 1'"
                className="w-full px-3 py-2 border rounded-md text-sm"
                disabled={isWorking}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-600">Planlagt dato</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                disabled={isWorking}
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-xs text-gray-600">
                  Starttid (valgfri)
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} disabled={isWorking} className="mt-0.5 w-full px-3 py-2 border rounded-md text-sm" />
                </label>
                <label className="text-xs text-gray-600">
                  Estimeret (timer, valgfri)
                  <input type="text" inputMode="decimal" value={formEst} onChange={(e) => setFormEst(e.target.value)} disabled={isWorking} placeholder="fx 3,5" className="mt-0.5 w-full px-3 py-2 border rounded-md text-sm" />
                </label>
              </div>
              <EmployeeDayLoadHint employeeId={formEmployee} date={formDate} startTime={formStart || null} estimatedHours={formEst || null} />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-600">Medarbejder</label>
              <select
                value={formEmployee}
                onChange={(e) => setFormEmployee(e.target.value)}
                disabled={isWorking || employees.length === 0}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">— Ingen tildelt —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-gray-600">Beskrivelse / opgave</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-md text-sm resize-none"
                placeholder="Hvad skal medarbejderen lave på dagen?"
                disabled={isWorking}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                resetForm()
                setError(null)
              }}
              disabled={isWorking}
              className="px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              Annullér
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isWorking}
              className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isWorking ? 'Opretter…' : 'Opret arbejdsordre'}
            </button>
          </div>
        </div>
      )}

      {/* List or empty state */}
      {workOrders.length === 0 && !showForm ? (
        <EmptyState onPlan={canPlan ? () => setShowForm(true) : null} />
      ) : (
        <>
          {/* Sag-level totals (sum across all work_orders) */}
          {caseTotals.count > 0 && (
            <div data-testid="case-time-totals" className="bg-gray-50 ring-1 ring-gray-200 rounded-md px-3 py-2 text-sm flex items-center flex-wrap gap-x-4 gap-y-1">
              <span className="font-semibold text-gray-700">Sagstotal:</span>
              <span>
                {caseTotals.count} timeregistrering
                {caseTotals.count === 1 ? '' : 'er'}
              </span>
              <span className="text-gray-400">·</span>
              <span>
                {caseTotals.hours.toLocaleString('da-DK', { maximumFractionDigits: 2 })} t
              </span>
              {showCost && caseTotals.cost > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span>
                    Intern kost:{' '}
                    <span className="font-medium">
                      {new Intl.NumberFormat('da-DK', {
                        style: 'currency',
                        currency: 'DKK',
                        maximumFractionDigits: 0,
                      }).format(caseTotals.cost)}
                    </span>
                  </span>
                </>
              )}
              {caseTotals.sale > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span>
                    Salgspris:{' '}
                    <span className="font-medium">
                      {new Intl.NumberFormat('da-DK', {
                        style: 'currency',
                        currency: 'DKK',
                        maximumFractionDigits: 0,
                      }).format(caseTotals.sale)}
                    </span>
                  </span>
                </>
              )}
              {showCost && caseTotals.sale > 0 && caseTotals.cost > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span>
                    DB:{' '}
                    <span
                      className={
                        caseTotals.sale - caseTotals.cost >= 0
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-red-700'
                      }
                    >
                      {new Intl.NumberFormat('da-DK', {
                        style: 'currency',
                        currency: 'DKK',
                        maximumFractionDigits: 0,
                      }).format(caseTotals.sale - caseTotals.cost)}
                    </span>
                  </span>
                </>
              )}
              {canSeeCost && (
                <span className="ml-auto">
                  <CostRevealToggle open={costOpen} onToggle={toggleCost} />
                </span>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {workOrders.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                caps={caps}
                wo={wo}
                canSeeCost={showCost && canSeeLaborCostDetail}
                onChangeStatus={onChangeStatus}
                onDelete={onDelete}
                disabled={isWorking}
                onLogsChange={() => {
                  // Re-pull case totals when a time-log is added/changed
                  reload()
                }}
                initialLogs={caseLogs ? (logsByWo.get(wo.id) ?? NO_LOGS) : null}
                sharedEmployees={sharedEmployees}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EmptyState({ onPlan }: { onPlan: (() => void) | null }) {
  return (
    <div className="text-center py-12 bg-gray-50 rounded-lg ring-1 ring-gray-200">
      <h3 className="text-base font-medium text-gray-700">Ingen planlagte opgaver endnu</h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        {onPlan
          ? 'Når du planlægger en medarbejder på en bestemt dag, oprettes der en arbejdsordre du kan følge igennem fra "Planlagt" til "Afsluttet".'
          : 'Kontoret planlægger opgaverne — de vises her, når du er sat på.'}
      </p>
      {onPlan && (
      <button
        type="button"
        onClick={onPlan}
        className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        + Planlæg medarbejder
      </button>
      )}
    </div>
  )
}

function WorkOrderRow({
  wo,
  onChangeStatus,
  onDelete,
  disabled,
  onLogsChange,
  canSeeCost = false,
  caps,
  initialLogs,
  sharedEmployees,
}: {
  caps: WorkOrderCaps
  wo: WorkOrderWithEmployee
  onChangeStatus: (woId: string, next: WorkOrderStatus) => void
  onDelete: (woId: string) => void
  disabled?: boolean
  onLogsChange?: () => void
  canSeeCost?: boolean
  initialLogs?: TimeLogWithEmployee[] | null
  sharedEmployees?: { id: string; name: string }[] | null
}) {
  // Kun knapper brugeren faktisk kan bruge — afgjort af serveren (rolle + N11-flag), samme regel som changeWorkOrderStatus.
  const { canStart, canComplete, canCancel, canDelete, canReopen } = caps
  const transitions = NEXT_TRANSITIONS[wo.status].filter((t) => (t === 'done' ? canComplete : t === 'in_progress' ? (wo.status === 'done' ? canReopen : canStart) : canCancel))

  return (
    <li className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[wo.status]}`}
            >
              {STATUS_LABELS[wo.status]}
            </span>
            {wo.scheduled_date && (
              <span className="text-xs text-gray-500">
                {fmtDate(wo.scheduled_date)}
                {/* M-8 (pilot-review 2026-10-15): starttid/estimat — før kun datoen */}
                {formatWorkOrderTime(wo.start_time, wo.estimated_hours) ? ` · ${formatWorkOrderTime(wo.start_time, wo.estimated_hours)}` : ''}
              </span>
            )}
            {wo.completed_at && (
              <span className="text-xs text-gray-500">
                · afsluttet {new Date(wo.completed_at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-gray-900 truncate">{wo.title}</div>
          {wo.description && (
            <div className="text-sm text-gray-600 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{wo.description}</div>
          )}
          <div className="text-xs text-gray-500">
            Medarbejder:{' '}
            {wo.employee ? (
              <span className="font-medium text-gray-700">
                {wo.employee.name}
                {wo.employee.email ? (
                  <a
                    href={`mailto:${wo.employee.email}`}
                    className="ml-1 text-emerald-700 hover:underline"
                  >
                    ({wo.employee.email})
                  </a>
                ) : null}
              </span>
            ) : (
              <span className="text-gray-400">— ingen tildelt —</span>
            )}
          </div>
        </div>

        {/* Actions — M-10 (pilot-review 2026-10-15): større tap-mål og afstand på telefon (før ~24 px tæt stablet) */}
        <div className="flex flex-col gap-2 sm:gap-1 shrink-0">
          {transitions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChangeStatus(wo.id, t)}
              disabled={disabled}
              className={`px-3 py-2.5 sm:px-2 sm:py-1 text-sm sm:text-xs rounded border whitespace-nowrap ${
                t === 'done'
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                  : t === 'cancelled'
                  ? 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700'
                  : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-800'
              } disabled:opacity-50`}
            >
              {t === 'in_progress' && (wo.status === 'done' ? '↺ Genåbn' : '→ Start')}
              {t === 'done' && '✓ Afslut'}
              {t === 'cancelled' && '✕ Annullér'}
            </button>
          ))}
          {wo.status === 'planned' && canDelete && (
            <button
              type="button"
              onClick={() => onDelete(wo.id)}
              disabled={disabled}
              className="px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
            >
              Slet
            </button>
          )}
        </div>
      </div>

      {/* Time logs (Sprint 4C) */}
      {wo.status !== 'cancelled' && (
        <WorkOrderTimeLogs
          workOrderId={wo.id}
          defaultEmployeeId={wo.assigned_employee_id ?? null}
          onChange={onLogsChange}
          canSeeCost={canSeeCost}
          initialLogs={initialLogs}
          sharedEmployees={sharedEmployees}
        />
      )}
    </li>
  )
}
