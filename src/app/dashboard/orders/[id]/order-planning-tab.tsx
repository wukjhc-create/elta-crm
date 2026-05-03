'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  listWorkOrdersForCase,
  createWorkOrderForCase,
  changeWorkOrderStatus,
  deletePlannedWorkOrder,
  type WorkOrderWithEmployee,
} from '@/lib/actions/work-orders'
import { getEmployeesForOrderSelect } from '@/lib/actions/service-cases'
import type { WorkOrderStatus } from '@/types/workforce.types'

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

const NEXT_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
}

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('da-DK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function OrderPlanningTab({
  caseId,
  caseTitle,
  caseDefaultEmployeeId,
}: {
  caseId: string
  caseTitle: string
  caseDefaultEmployeeId?: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [workOrders, setWorkOrders] = useState<WorkOrderWithEmployee[] | null>(null)
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  // Inline create form state
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formEmployee, setFormEmployee] = useState<string>(caseDefaultEmployeeId ?? '')
  const [formDescription, setFormDescription] = useState('')

  const reload = async () => {
    const [woRes, empRes] = await Promise.all([
      listWorkOrdersForCase(caseId),
      getEmployeesForOrderSelect(),
    ])
    if (woRes.success && woRes.data) setWorkOrders(woRes.data)
    else setError(woRes.error || 'Kunne ikke hente arbejdsordrer')
    if (empRes.success && empRes.data) setEmployees(empRes.data)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const resetForm = () => {
    setFormTitle('')
    setFormDate('')
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
    const res = await createWorkOrderForCase({
      case_id: caseId,
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      scheduled_date: formDate || null,
      assigned_employee_id: formEmployee || null,
    })
    setIsWorking(false)
    if (!res.success) {
      setError(res.error || 'Kunne ikke oprette arbejdsordre')
      return
    }
    setShowForm(false)
    resetForm()
    await reload()
    startTransition(() => router.refresh())
  }

  const onChangeStatus = async (woId: string, next: WorkOrderStatus) => {
    setError(null)
    setIsWorking(true)
    const res = await changeWorkOrderStatus(woId, next)
    setIsWorking(false)
    if (!res.success) {
      setError(res.error || 'Kunne ikke ændre status')
      return
    }
    await reload()
    startTransition(() => router.refresh())
  }

  const onDelete = async (woId: string) => {
    if (!window.confirm('Slet denne planlagte arbejdsordre? Handlingen kan ikke fortrydes.')) return
    setError(null)
    setIsWorking(true)
    const res = await deletePlannedWorkOrder(woId)
    setIsWorking(false)
    if (!res.success) {
      setError(res.error || 'Kunne ikke slette')
      return
    }
    await reload()
    startTransition(() => router.refresh())
  }

  if (workOrders === null) {
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
        {!showForm && (
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
        <EmptyState onPlan={() => setShowForm(true)} />
      ) : (
        <ul className="space-y-2">
          {workOrders.map((wo) => (
            <WorkOrderRow
              key={wo.id}
              wo={wo}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              disabled={isWorking}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyState({ onPlan }: { onPlan: () => void }) {
  return (
    <div className="text-center py-12 bg-gray-50 rounded-lg ring-1 ring-gray-200">
      <h3 className="text-base font-medium text-gray-700">Ingen planlagte opgaver endnu</h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        Når du planlægger en medarbejder på en bestemt dag, oprettes der en
        arbejdsordre du kan følge igennem fra "Planlagt" til "Afsluttet".
      </p>
      <button
        type="button"
        onClick={onPlan}
        className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        + Planlæg medarbejder
      </button>
    </div>
  )
}

function WorkOrderRow({
  wo,
  onChangeStatus,
  onDelete,
  disabled,
}: {
  wo: WorkOrderWithEmployee
  onChangeStatus: (woId: string, next: WorkOrderStatus) => void
  onDelete: (woId: string) => void
  disabled?: boolean
}) {
  const transitions = NEXT_TRANSITIONS[wo.status]

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
              <span className="text-xs text-gray-500">{fmtDate(wo.scheduled_date)}</span>
            )}
            {wo.completed_at && (
              <span className="text-xs text-gray-500">
                · afsluttet {new Date(wo.completed_at).toLocaleString('da-DK')}
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-gray-900 truncate">{wo.title}</div>
          {wo.description && (
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{wo.description}</div>
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

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          {transitions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChangeStatus(wo.id, t)}
              disabled={disabled}
              className={`px-2 py-1 text-xs rounded border whitespace-nowrap ${
                t === 'done'
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                  : t === 'cancelled'
                  ? 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700'
                  : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-800'
              } disabled:opacity-50`}
            >
              {t === 'in_progress' && '→ Start'}
              {t === 'done' && '✓ Afslut'}
              {t === 'cancelled' && '✕ Annullér'}
            </button>
          ))}
          {wo.status === 'planned' && (
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
    </li>
  )
}
