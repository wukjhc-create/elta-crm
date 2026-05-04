'use client'

/**
 * Sprint 4D-2 — "Planlæg opgave" dialog.
 *
 * Opens from the calendar header. Lets the user create a new work_order
 * directly from the calendar without leaving the page:
 *  - pick service_case (open ones only)
 *  - pick employee (active ones from parent)
 *  - pick date (defaults to current calendar anchor date)
 *  - title + optional description
 *  - status defaults to "planned" via the server action
 *
 * On success the router refreshes so the chip appears in the grid.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, AlertCircle, Search } from 'lucide-react'
import { createWorkOrderForCase } from '@/lib/actions/work-orders'
import { listOpenServiceCasesForPicker } from '@/lib/actions/service-cases'
import type { EmployeeRow } from '@/types/employees.types'

interface CasePickerRow {
  id: string
  case_number: string
  title: string
  status: string
  customer_name: string | null
}

export function PlanWorkOrderDialog({
  open,
  onClose,
  defaultDate,
  defaultEmployeeId,
  employees,
}: {
  open: boolean
  onClose: () => void
  defaultDate: string                        // YYYY-MM-DD
  defaultEmployeeId?: string | null
  employees: EmployeeRow[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [cases, setCases] = useState<CasePickerRow[] | null>(null)
  const [casesError, setCasesError] = useState<string | null>(null)
  const [caseSearch, setCaseSearch] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string>('')

  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId ?? '')
  const [date, setDate] = useState<string>(defaultDate)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const titleInputRef = useRef<HTMLInputElement | null>(null)

  // Load cases on first open
  useEffect(() => {
    if (!open || cases !== null) return
    let cancelled = false
    setCasesError(null)
    listOpenServiceCasesForPicker().then((res) => {
      if (cancelled) return
      if (!res.success) {
        setCasesError(res.error ?? 'Kunne ikke hente sager')
        setCases([])
      } else {
        setCases(res.data ?? [])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, cases])

  // Reset form on each open
  useEffect(() => {
    if (!open) return
    setSelectedCaseId('')
    setCaseSearch('')
    setEmployeeId(defaultEmployeeId ?? '')
    setDate(defaultDate)
    setTitle('')
    setDescription('')
    setSubmitError(null)
    setSubmitting(false)
  }, [open, defaultDate, defaultEmployeeId])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  const filteredCases = useMemo(() => {
    if (!cases) return []
    const q = caseSearch.trim().toLowerCase()
    if (!q) return cases.slice(0, 30)
    return cases
      .filter(
        (c) =>
          c.case_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.customer_name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [cases, caseSearch])

  const selectedCase = useMemo(
    () => cases?.find((c) => c.id === selectedCaseId) ?? null,
    [cases, selectedCaseId]
  )

  if (!open) return null

  const canSubmit =
    !!selectedCaseId &&
    title.trim().length > 0 &&
    !submitting

  const handleSubmit = async () => {
    setSubmitError(null)
    if (!selectedCaseId) {
      setSubmitError('Vælg en sag')
      return
    }
    if (!title.trim()) {
      setSubmitError('Titel er påkrævet')
      return
    }
    setSubmitting(true)
    const res = await createWorkOrderForCase({
      case_id: selectedCaseId,
      title: title.trim(),
      description: description.trim() || null,
      scheduled_date: date || null,
      assigned_employee_id: employeeId || null,
      status: 'planned',
    })
    if (!res.success) {
      setSubmitting(false)
      setSubmitError(res.error ?? 'Kunne ikke oprette arbejdsordre')
      return
    }
    // Close + refresh so the chip lights up in the grid
    onClose()
    startTransition(() => router.refresh())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        // Click on backdrop closes the dialog (unless submitting)
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-wo-title"
        className="w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="plan-wo-title" className="text-base font-semibold text-gray-900">
            Planlæg opgave
          </h2>
          <button
            onClick={() => !submitting && onClose()}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Luk"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Sag */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Sag <span className="text-red-500">*</span>
            </label>
            {selectedCase ? (
              <div className="flex items-center justify-between rounded ring-1 ring-emerald-300 bg-emerald-50 px-2 py-1.5 text-sm">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-emerald-900">
                    {selectedCase.case_number}
                  </div>
                  <div className="font-medium truncate">{selectedCase.title}</div>
                  {selectedCase.customer_name && (
                    <div className="text-xs text-gray-600 truncate">
                      {selectedCase.customer_name}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedCaseId('')}
                  className="ml-2 text-xs text-emerald-700 hover:underline"
                  type="button"
                >
                  Skift
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder="Søg på sagsnr, titel eller kunde…"
                    className="w-full pl-7 pr-2 py-1.5 border rounded text-sm"
                    autoFocus
                  />
                </div>
                <div className="mt-1 max-h-44 overflow-y-auto rounded ring-1 ring-gray-200 bg-white">
                  {cases === null ? (
                    <div className="p-3 text-xs text-gray-500 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Henter sager…
                    </div>
                  ) : casesError ? (
                    <div className="p-3 text-xs text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" /> {casesError}
                    </div>
                  ) : filteredCases.length === 0 ? (
                    <div className="p-3 text-xs text-gray-500">Ingen åbne sager matcher</div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {filteredCases.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCaseId(c.id)
                              if (!title) setTitle(c.title)
                            }}
                            className="w-full text-left px-2 py-1.5 text-sm hover:bg-emerald-50"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-gray-500">
                                {c.case_number}
                              </span>
                              <span className="font-medium truncate">{c.title}</span>
                            </div>
                            {c.customer_name && (
                              <div className="text-[11px] text-gray-500 truncate">
                                {c.customer_name}
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Medarbejder */}
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

          {/* Dato */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dato</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          {/* Titel */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Titel <span className="text-red-500">*</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="F.eks. Montage – stueetage"
              className="w-full border rounded px-2 py-1.5 text-sm"
              maxLength={200}
            />
          </div>

          {/* Beskrivelse */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Beskrivelse
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Valgfri detaljer, evt. medbring-liste eller adresse"
              className="w-full border rounded px-2 py-1.5 text-sm"
              maxLength={2000}
            />
          </div>

          {submitError && (
            <div className="rounded ring-1 ring-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {submitError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-4 py-2.5 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-100 disabled:opacity-60"
          >
            Annullér
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1"
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Opret arbejdsordre
          </button>
        </div>
      </div>
    </div>
  )
}
