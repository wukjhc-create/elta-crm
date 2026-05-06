'use client'

/**
 * Sprint 6F-3 — CreditNoteDialog.
 *
 * 3 modes:
 *   - 'full'         — krediter alt resterende
 *   - 'partial-lines'— vælg specifikke fakturalinjer
 *   - 'partial-amount'— indtast eget beløb (≤ remaining)
 *
 * Kalder createCreditNoteForInvoiceAction (Sprint 6F-2). Service
 * laver alle DB-checks; dialog viser fejl inline + redirecter til
 * kreditnota-detail ved succes.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, Loader2, FileMinus, ChevronRight,
} from 'lucide-react'
import {
  createCreditNoteForInvoiceAction,
} from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils/format'
import type { InvoiceLineRow } from '@/types/invoice.types'

type Mode = 'full' | 'partial-lines' | 'partial-amount'

const fmtKr = (n: number) => formatCurrency(n, 'DKK', 2)

export function CreditNoteDialog({
  open,
  invoiceId,
  invoiceNumber,
  currency,
  remainingExVat,
  vatRate,
  lines,
  onClose,
  onCreated,
}: {
  open: boolean
  invoiceId: string
  invoiceNumber: string
  currency: string
  remainingExVat: number
  vatRate: number                 // fx 0.25
  lines: InvoiceLineRow[]
  onClose: () => void
  onCreated: (creditInvoiceId: string) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [mode, setMode] = useState<Mode>('full')
  const [reason, setReason] = useState('')
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set())
  const [customAmountStr, setCustomAmountStr] = useState('')
  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('full')
    setReason('')
    setSelectedLineIds(new Set())
    setCustomAmountStr('')
    setDueDays(14)
    setNotes('')
    setError(null)
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  const customAmount = useMemo(() => {
    const n = Number(customAmountStr.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }, [customAmountStr])

  // Live preview of credit amount based on mode
  const preview = useMemo(() => {
    let exVat = 0
    if (mode === 'full') {
      exVat = remainingExVat
    } else if (mode === 'partial-lines') {
      for (const l of lines) {
        if (selectedLineIds.has(l.id)) {
          exVat += Math.abs(Number(l.total_price))
        }
      }
    } else {
      // partial-amount
      exVat = customAmount
    }
    const r2 = (n: number) => Math.round(n * 100) / 100
    const vat = r2(exVat * vatRate)
    return {
      exVat: r2(exVat),
      vat,
      incl: r2(exVat + vat),
    }
  }, [mode, remainingExVat, lines, selectedLineIds, customAmount, vatRate])

  const overRemaining = preview.exVat > remainingExVat + 0.005

  const canSubmit = (() => {
    if (submitting) return false
    if (!reason.trim()) return false
    if (preview.exVat <= 0) return false
    if (overRemaining) return false
    if (mode === 'partial-lines' && selectedLineIds.size === 0) return false
    if (mode === 'partial-amount' && customAmount <= 0) return false
    return true
  })()

  const handleSubmit = async () => {
    setError(null)
    if (!window.confirm(
      `Opret kreditnota for ${invoiceNumber}?\n\n` +
      `Beløb: ${fmtKr(preview.exVat)} ekskl. moms (${fmtKr(preview.incl)} inkl.)\n` +
      `Type: ${mode === 'full' ? 'Fuld' : mode === 'partial-lines' ? 'Delvis (linjer)' : 'Delvis (beløb)'}\n\n` +
      `Begrundelse: ${reason.trim()}`
    )) return
    setSubmitting(true)
    const res = await createCreditNoteForInvoiceAction({
      invoice_id: invoiceId,
      credit_type: mode === 'full' ? 'full' : 'partial',
      reason: reason.trim(),
      selected_line_ids:
        mode === 'partial-lines' ? Array.from(selectedLineIds) : undefined,
      custom_amount_ex_vat:
        mode === 'partial-amount' ? customAmount : undefined,
      due_days: dueDays,
      notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (!res.ok || !res.credit_invoice_id) {
      setError(res.message)
      return
    }
    onCreated(res.credit_invoice_id)
    startTransition(() => {
      router.push(`/dashboard/invoices/${res.credit_invoice_id}`)
    })
  }

  if (!open) return null

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-note-title"
        className="w-full max-w-2xl max-h-full overflow-y-auto rounded-lg bg-white shadow-xl ring-1 ring-red-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
          <h2 id="credit-note-title" className="text-base font-semibold text-red-900 flex items-center gap-2">
            <FileMinus className="w-5 h-5 text-red-600" />
            Krediter faktura {invoiceNumber}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-xs text-gray-500 hover:text-gray-700"
            aria-label="Luk"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Remaining banner */}
          <div className="rounded ring-1 ring-amber-300 bg-amber-50 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-amber-900">Resterende krediterbart</span>
            <span className="text-amber-900 tabular-nums font-semibold">
              {fmtKr(remainingExVat)} ekskl. moms
            </span>
          </div>

          {/* Mode-vælger */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">
              Type
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { key: 'full' as const, label: 'Fuld kreditnota', desc: 'Hele resterende beløb' },
                  { key: 'partial-lines' as const, label: 'Delvis — linjer', desc: 'Vælg specifikke linjer' },
                  { key: 'partial-amount' as const, label: 'Delvis — beløb', desc: 'Indtast eget beløb' },
                ] as const
              ).map((opt) => {
                const active = mode === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    disabled={submitting}
                    className={`text-left rounded-lg px-3 py-2 ring-1 transition ${
                      active
                        ? 'bg-red-50 ring-red-300 text-red-900'
                        : 'bg-white ring-gray-200 hover:bg-gray-50 text-gray-700'
                    } disabled:opacity-50`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mode-specifikt input */}
          {mode === 'partial-lines' && (
            <div className="rounded ring-1 ring-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b text-xs text-gray-600 flex items-center justify-between">
                <span>Vælg linjer at kreditere</span>
                <span>{selectedLineIds.size} valgt</span>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 w-8" />
                      <th className="px-2 py-1.5">Beskrivelse</th>
                      <th className="px-2 py-1.5 text-right">Antal</th>
                      <th className="px-2 py-1.5">Enhed</th>
                      <th className="px-2 py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-xs text-gray-400">
                          Ingen linjer på fakturaen
                        </td>
                      </tr>
                    )}
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={selectedLineIds.has(l.id)}
                            onChange={() => toggleLine(l.id)}
                            disabled={submitting}
                          />
                        </td>
                        <td className="px-2 py-1.5">{l.description}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {Number(l.quantity).toLocaleString('da-DK', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-1.5 text-gray-600">{l.unit ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmtKr(Number(l.total_price))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mode === 'partial-amount' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Beløb at kreditere (ekskl. moms) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={customAmountStr}
                onChange={(e) => setCustomAmountStr(e.target.value)}
                disabled={submitting}
                placeholder={`Maks ${fmtKr(remainingExVat)}`}
                className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Skal være større end 0 og ≤ {fmtKr(remainingExVat)}.
              </p>
            </div>
          )}

          {/* Reason — påkrævet i alle modes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Begrundelse <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              disabled={submitting}
              rows={2}
              placeholder="Vises på kreditnota-PDF og i audit-trail"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Betalingsfrist (dage)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={dueDays}
                onChange={(e) =>
                  setDueDays(Math.max(0, Math.min(120, Number(e.target.value) || 0)))
                }
                disabled={submitting}
                className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Intern note (valgfri)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                disabled={submitting}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded ring-1 ring-red-200 bg-red-50 p-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-red-700">Subtotal</div>
              <div className="tabular-nums font-semibold text-red-900">
                {preview.exVat > 0 ? `−${fmtKr(preview.exVat)}` : fmtKr(0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-red-700">
                Moms ({Math.round(vatRate * 100)} %)
              </div>
              <div className="tabular-nums font-semibold text-red-900">
                {preview.vat > 0 ? `−${fmtKr(preview.vat)}` : fmtKr(0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-red-700">Total inkl. moms</div>
              <div className="tabular-nums font-bold text-red-900 text-base">
                {preview.incl > 0 ? `−${fmtKr(preview.incl)}` : fmtKr(0)}
              </div>
            </div>
          </div>

          {overRemaining && (
            <div className="rounded ring-1 ring-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Beløbet ({fmtKr(preview.exVat)}) overstiger resterende krediterbart
              ({fmtKr(remainingExVat)}). Reducér eller vælg færre linjer.
            </div>
          )}

          {error && (
            <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-gray-50 px-4 py-2.5 rounded-b-lg sticky bottom-0">
          <p className="text-[11px] text-gray-500">
            Kreditnotaen oprettes som <strong>kladde</strong> (status=draft). Ingen
            mail sendes automatisk. Ingen e-conomic-push i denne sprint.
          </p>
          <div className="flex items-center gap-2">
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
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileMinus className="w-3.5 h-3.5" />
              )}
              Opret kreditnota
              <ChevronRight className="w-3 h-3 opacity-70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
