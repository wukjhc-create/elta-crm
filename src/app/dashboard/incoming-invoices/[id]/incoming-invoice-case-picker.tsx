'use client'

/**
 * Sprint 5E-1 commit 3 — Case picker dialog for incoming invoices.
 *
 * Lets the operator manually attach (or change) the sag a leverandør-
 * faktura is linked to. Reuses listOpenServiceCasesForPicker (Sprint
 * 4D-2). Sets matched_case_id; matched_work_order_id is cleared by
 * the server action because we don't know which WO is right after a
 * manual case-switch.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, AlertCircle, Search } from 'lucide-react'
import { listOpenServiceCasesForPicker } from '@/lib/actions/service-cases'

interface CasePickerRow {
  id: string
  case_number: string
  title: string
  status: string
  customer_name: string | null
}

export function IncomingInvoiceCasePicker({
  open,
  currentCaseId,
  onClose,
  onPick,
  submitting,
  error,
}: {
  open: boolean
  currentCaseId: string | null
  onClose: () => void
  onPick: (caseId: string) => void
  submitting: boolean
  error: string | null
}) {
  const [cases, setCases] = useState<CasePickerRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open || cases !== null) return
    let cancelled = false
    setLoadError(null)
    listOpenServiceCasesForPicker().then((res) => {
      if (cancelled) return
      if (!res.success) {
        setLoadError(res.error ?? 'Kunne ikke hente sager')
        setCases([])
      } else {
        setCases(res.data ?? [])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, cases])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  const filtered = useMemo(() => {
    if (!cases) return []
    const q = search.trim().toLowerCase()
    if (!q) return cases.slice(0, 30)
    return cases
      .filter(
        (c) =>
          c.case_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.customer_name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [cases, search])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ii-case-picker-title"
        className="w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="ii-case-picker-title" className="text-base font-semibold text-gray-900">
            {currentCaseId ? 'Skift sag' : 'Match til sag'}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Luk"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-gray-600">
            Vælg den sag, fakturaen skal tilknyttes.
            {currentCaseId && (
              <>
                {' '}
                Sagen erstattes for denne faktura. <strong>matched_work_order_id</strong> ryddes
                automatisk — du kan tilknytte en specifik arbejdsordre senere.
              </>
            )}
          </p>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg på sagsnr, titel eller kunde…"
              className="w-full pl-7 pr-2 py-1.5 border rounded text-sm"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded ring-1 ring-gray-200 bg-white">
            {cases === null ? (
              <div className="p-3 text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Henter sager…
              </div>
            ) : loadError ? (
              <div className="p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" /> {loadError}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-xs text-gray-500">Ingen åbne sager matcher</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const isCurrent = c.id === currentCaseId
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={submitting || isCurrent}
                        onClick={() => onPick(c.id)}
                        className={`w-full text-left px-2 py-1.5 text-sm transition ${
                          isCurrent
                            ? 'bg-emerald-50 cursor-default'
                            : 'hover:bg-emerald-50'
                        } disabled:opacity-60`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-gray-500">
                            {c.case_number}
                          </span>
                          <span className="font-medium truncate">{c.title}</span>
                          {isCurrent && (
                            <span className="ml-auto text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                              Nuværende
                            </span>
                          )}
                        </div>
                        {c.customer_name && (
                          <div className="text-[11px] text-gray-500 truncate">
                            {c.customer_name}
                          </div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && (
            <div className="rounded ring-1 ring-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
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
        </div>
      </div>
    </div>
  )
}
