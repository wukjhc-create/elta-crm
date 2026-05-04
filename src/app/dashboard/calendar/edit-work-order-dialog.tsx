'use client'

/**
 * Sprint 4D-2 — Edit + quick-actions dialog for a single work_order.
 *
 * Opens when a chip is clicked in the calendar grid. Lets the user:
 *  - jump to the parent service_case
 *  - change title / description
 *  - change scheduled_date
 *  - change assigned_employee_id
 *  - perform allowed status transitions (planned → in_progress / cancelled,
 *    in_progress → done / cancelled). Done/cancelled are terminal.
 *
 * The status state machine is enforced by changeWorkOrderStatus on the
 * server — buttons here only show transitions that are allowed for the
 * current status. The "Afslut" button is blocked server-side if a timer
 * is open, and the error is shown inline.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X, Loader2, AlertCircle, ExternalLink,
  Play, CheckCircle2, XCircle, RotateCcw,
} from 'lucide-react'
import {
  updateWorkOrderPlanning,
  changeWorkOrderStatus,
  type WorkOrderForCalendar,
} from '@/lib/actions/work-orders'
import type { EmployeeRow } from '@/types/employees.types'
import type { WorkOrderStatus } from '@/types/workforce.types'

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  planned: 'Planlagt',
  in_progress: 'I gang',
  done: 'Afsluttet',
  cancelled: 'Annulleret',
}

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  planned: 'bg-blue-100 text-blue-800 ring-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
  done: 'bg-green-100 text-green-800 ring-green-200',
  cancelled: 'bg-gray-100 text-gray-700 ring-gray-200',
}

const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
}

export function EditWorkOrderDialog({
  open,
  onClose,
  workOrder,
  employees,
}: {
  open: boolean
  onClose: () => void
  workOrder: WorkOrderForCalendar | null
  employees: EmployeeRow[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [currentStatus, setCurrentStatus] = useState<WorkOrderStatus>('planned')

  const [savingPatch, setSavingPatch] = useState(false)
  const [statusBusy, setStatusBusy] = useState<WorkOrderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Reset state every time we open with a new work order
  useEffect(() => {
    if (!open || !workOrder) return
    setTitle(workOrder.title ?? '')
    setDescription(workOrder.description ?? '')
    setDate(workOrder.scheduled_date ? workOrder.scheduled_date.slice(0, 10) : '')
    setEmployeeId(workOrder.assigned_employee_id ?? '')
    setCurrentStatus(workOrder.status as WorkOrderStatus)
    setError(null)
    setInfo(null)
    setSavingPatch(false)
    setStatusBusy(null)
  }, [open, workOrder])

  // Esc to close (when nothing in flight)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingPatch && !statusBusy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, savingPatch, statusBusy, onClose])

  if (!open || !workOrder) return null

  const initial = {
    title: workOrder.title ?? '',
    description: workOrder.description ?? '',
    date: workOrder.scheduled_date ? workOrder.scheduled_date.slice(0, 10) : '',
    employeeId: workOrder.assigned_employee_id ?? '',
  }

  const isDirty =
    title.trim() !== initial.title.trim() ||
    (description ?? '').trim() !== (initial.description ?? '').trim() ||
    date !== initial.date ||
    (employeeId || '') !== (initial.employeeId || '')

  const isTerminal = currentStatus === 'done' || currentStatus === 'cancelled'

  const handleSavePatch = async () => {
    if (!workOrder) return
    if (!title.trim()) {
      setError('Titel er påkrævet')
      return
    }
    setError(null)
    setInfo(null)
    setSavingPatch(true)
    const res = await updateWorkOrderPlanning(workOrder.id, {
      title: title.trim() !== initial.title.trim() ? title : undefined,
      description:
        (description ?? '').trim() !== (initial.description ?? '').trim()
          ? description
          : undefined,
      scheduled_date: date !== initial.date ? (date || null) : undefined,
      assigned_employee_id:
        (employeeId || '') !== (initial.employeeId || '')
          ? (employeeId || null)
          : undefined,
    })
    setSavingPatch(false)
    if (!res.success) {
      setError(res.error ?? 'Kunne ikke opdatere arbejdsordre')
      return
    }
    setInfo('Ændringer gemt')
    startTransition(() => router.refresh())
  }

  const handleStatus = async (next: WorkOrderStatus) => {
    if (!workOrder) return
    setError(null)
    setInfo(null)
    setStatusBusy(next)
    const res = await changeWorkOrderStatus(workOrder.id, next)
    setStatusBusy(null)
    if (!res.success) {
      setError(res.error ?? 'Kunne ikke ændre status')
      return
    }
    setCurrentStatus(next)
    setInfo(`Status ændret til "${STATUS_LABELS[next]}"`)
    startTransition(() => router.refresh())
  }

  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] ?? []

  const caseHref = workOrder.case?.case_number
    ? `/dashboard/orders/${workOrder.case.case_number}`
    : workOrder.case?.id
    ? `/dashboard/orders/${workOrder.case.id}`
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !savingPatch && !statusBusy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-wo-title"
        className="w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b px-4 py-3">
          <div className="min-w-0 pr-4">
            <h2 id="edit-wo-title" className="text-base font-semibold text-gray-900 truncate">
              {workOrder.title || 'Arbejdsordre'}
            </h2>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`px-1.5 py-0.5 rounded ring-1 text-[10px] uppercase tracking-wide ${STATUS_COLORS[currentStatus]}`}
              >
                {STATUS_LABELS[currentStatus]}
              </span>
              {workOrder.case?.case_number && (
                <span className="font-mono">{workOrder.case.case_number}</span>
              )}
              {workOrder.case?.customer_name && (
                <span className="truncate">· {workOrder.case.customer_name}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => !savingPatch && !statusBusy && onClose()}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Luk"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Sag-link */}
          {caseHref && (
            <Link
              href={caseHref}
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Åbn sag {workOrder.case?.case_number ?? ''}
            </Link>
          )}

          {/* Quick actions */}
          {!isTerminal && allowedNext.length > 0 && (
            <div className="rounded ring-1 ring-gray-200 bg-gray-50 p-2">
              <div className="text-xs font-medium text-gray-700 mb-1.5">
                Hurtige handlinger
              </div>
              <div className="flex flex-wrap gap-2">
                {allowedNext.includes('in_progress') && (
                  <QuickActionButton
                    onClick={() => handleStatus('in_progress')}
                    disabled={!!statusBusy}
                    busy={statusBusy === 'in_progress'}
                    icon={<Play className="w-3.5 h-3.5" />}
                    label="Start"
                    color="yellow"
                  />
                )}
                {allowedNext.includes('done') && (
                  <QuickActionButton
                    onClick={() => handleStatus('done')}
                    disabled={!!statusBusy}
                    busy={statusBusy === 'done'}
                    icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    label="Afslut"
                    color="green"
                  />
                )}
                {allowedNext.includes('cancelled') && (
                  <QuickActionButton
                    onClick={() => handleStatus('cancelled')}
                    disabled={!!statusBusy}
                    busy={statusBusy === 'cancelled'}
                    icon={<XCircle className="w-3.5 h-3.5" />}
                    label="Annullér"
                    color="gray"
                  />
                )}
              </div>
            </div>
          )}

          {isTerminal && (
            <div className="rounded ring-1 ring-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              Arbejdsordren er {STATUS_LABELS[currentStatus].toLowerCase()} — status er låst.
            </div>
          )}

          {/* Editable fields — disabled if terminal */}
          <fieldset disabled={isTerminal} className="space-y-3 disabled:opacity-60">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Titel <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Dato</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Medarbejder
                </label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— Ikke tildelt —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Beskrivelse
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border rounded px-2 py-1.5 text-sm"
                maxLength={2000}
              />
            </div>
          </fieldset>

          {error && (
            <div className="rounded ring-1 ring-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
          {info && !error && (
            <div className="rounded ring-1 ring-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
              {info}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-4 py-2.5 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={savingPatch || !!statusBusy}
            className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-100 disabled:opacity-60"
          >
            Luk
          </button>
          <button
            type="button"
            onClick={handleSavePatch}
            disabled={isTerminal || !isDirty || savingPatch}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1"
          >
            {savingPatch && <Loader2 className="w-3 h-3 animate-spin" />}
            Gem ændringer
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickActionButton({
  onClick,
  disabled,
  busy,
  icon,
  label,
  color,
}: {
  onClick: () => void
  disabled: boolean
  busy: boolean
  icon: React.ReactNode
  label: string
  color: 'yellow' | 'green' | 'gray'
}) {
  const palette: Record<typeof color, string> = {
    yellow: 'bg-yellow-100 text-yellow-900 hover:bg-yellow-200 ring-yellow-300',
    green: 'bg-green-100 text-green-900 hover:bg-green-200 ring-green-300',
    gray: 'bg-gray-100 text-gray-800 hover:bg-gray-200 ring-gray-300',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ring-1 transition ${palette[color]} disabled:opacity-50`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  )
}
