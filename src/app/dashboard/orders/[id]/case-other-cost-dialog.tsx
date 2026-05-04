'use client'

/**
 * Sprint 5C — Add / edit dialog for case_other_costs.
 *
 * Manual entry with category dropdown. Receipt upload UI deferred —
 * receipt_url + receipt_filename are kept as text fields here so an
 * operator can paste a link / filename if they already have one
 * stored elsewhere. Full upload comes later.
 */

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  createCaseOtherCost,
  updateCaseOtherCost,
} from '@/lib/actions/case-other-costs'
import {
  CASE_OTHER_COST_CATEGORIES,
  CASE_OTHER_COST_CATEGORY_LABELS,
  type CaseOtherCostCategory,
  type CaseOtherCostRow,
} from '@/types/case-other-costs.types'

interface FormState {
  category: CaseOtherCostCategory
  description: string
  supplier_name: string
  cost_date: string
  unit: string
  quantity: string
  unit_cost: string
  unit_sales_price: string
  receipt_url: string
  receipt_filename: string
  billable: boolean
  notes: string
}

const todayKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY: FormState = {
  category: 'koersel',
  description: '',
  supplier_name: '',
  cost_date: todayKey(),
  unit: 'stk',
  quantity: '1',
  unit_cost: '0',
  unit_sales_price: '0',
  receipt_url: '',
  receipt_filename: '',
  billable: true,
  notes: '',
}

const UNIT_OPTIONS = ['stk', 'km', 'time', 'dag', 'uge', 'kg', 'pakke', 'rejse', 'gebyr']

export function CaseOtherCostDialog({
  open,
  caseId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  caseId: string
  editing: CaseOtherCostRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    if (editing) {
      setForm({
        category: editing.category,
        description: editing.description,
        supplier_name: editing.supplier_name ?? '',
        cost_date: (editing.cost_date ?? '').slice(0, 10) || todayKey(),
        unit: editing.unit,
        quantity: String(editing.quantity),
        unit_cost: String(editing.unit_cost),
        unit_sales_price: String(editing.unit_sales_price),
        receipt_url: editing.receipt_url ?? '',
        receipt_filename: editing.receipt_filename ?? '',
        billable: editing.billable,
        notes: editing.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY, cost_date: todayKey() })
    }
  }, [open, editing])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const parsedQty = Number(form.quantity.replace(',', '.'))
  const parsedCost = Number(form.unit_cost.replace(',', '.'))
  const parsedSale = Number(form.unit_sales_price.replace(',', '.'))
  const totalCost = Number.isFinite(parsedQty) && Number.isFinite(parsedCost) ? parsedQty * parsedCost : 0
  const totalSale = Number.isFinite(parsedQty) && Number.isFinite(parsedSale) ? parsedQty * parsedSale : 0
  const db = totalSale - totalCost
  const dbPct = totalSale > 0 ? (db / totalSale) * 100 : 0

  const canSubmit =
    form.description.trim().length > 0 &&
    Number.isFinite(parsedQty) && parsedQty > 0 &&
    Number.isFinite(parsedCost) && parsedCost >= 0 &&
    Number.isFinite(parsedSale) && parsedSale >= 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.cost_date) &&
    !submitting

  const handleSubmit = async () => {
    setError(null)
    if (!canSubmit) {
      setError('Tjek dato, antal, kostpris og salgspris')
      return
    }
    setSubmitting(true)

    const payload = {
      category: form.category,
      description: form.description.trim(),
      supplier_name: form.supplier_name.trim() || null,
      cost_date: form.cost_date,
      unit: form.unit.trim() || 'stk',
      quantity: parsedQty,
      unit_cost: parsedCost,
      unit_sales_price: parsedSale,
      receipt_url: form.receipt_url.trim() || null,
      receipt_filename: form.receipt_filename.trim() || null,
      billable: form.billable,
      notes: form.notes.trim() || null,
    }

    const res = editing
      ? await updateCaseOtherCost(editing.id, payload)
      : await createCaseOtherCost({ ...payload, case_id: caseId, source: 'manual' })

    if (!res.success) {
      setSubmitting(false)
      setError(res.error ?? 'Kunne ikke gemme omkostning')
      return
    }

    onSaved()
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

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
        aria-labelledby="case-other-cost-dialog-title"
        className="w-full max-w-xl rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="case-other-cost-dialog-title" className="text-base font-semibold text-gray-900">
            {editing ? 'Rediger omkostning' : 'Tilføj omkostning'}
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Kategori <span className="text-red-500">*</span>
              </label>
              <select
                ref={firstInputRef}
                value={form.category}
                onChange={(e) => update('category', e.target.value as CaseOtherCostCategory)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                {CASE_OTHER_COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CASE_OTHER_COST_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Dato <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.cost_date}
                onChange={(e) => update('cost_date', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Beskrivelse <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={400}
              placeholder="F.eks. Kørsel til Aalborg, 2 ture"
              className="w-full border rounded px-2 py-1.5 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Leverandør / udbyder
            </label>
            <input
              type="text"
              value={form.supplier_name}
              onChange={(e) => update('supplier_name', e.target.value)}
              maxLength={200}
              placeholder="Valgfri (Cramo, Q-Park, Lars Jensen ApS, …)"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Antal <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Enhed</label>
              <select
                value={form.unit}
                onChange={(e) => update('unit', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => update('billable', e.target.checked)}
                  className="rounded border-gray-300"
                />
                Faktureres
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Kostpris pr. enhed (DKK)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.unit_cost}
                onChange={(e) => update('unit_cost', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Salgspris pr. enhed (DKK)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.unit_sales_price}
                onChange={(e) => update('unit_sales_price', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
              />
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded ring-1 ring-gray-200 bg-gray-50 px-3 py-2 text-xs grid grid-cols-3 gap-2">
            <div>
              <div className="text-gray-500 uppercase text-[10px] tracking-wide">Sum kost</div>
              <div className="tabular-nums font-semibold text-gray-900">
                {Number.isFinite(totalCost) ? totalCost.toFixed(2) : '—'}
              </div>
            </div>
            <div>
              <div className="text-gray-500 uppercase text-[10px] tracking-wide">Sum salg</div>
              <div className="tabular-nums font-semibold text-gray-900">
                {Number.isFinite(totalSale) ? totalSale.toFixed(2) : '—'}
              </div>
            </div>
            <div>
              <div className="text-gray-500 uppercase text-[10px] tracking-wide">DB</div>
              <div className="flex items-center gap-1">
                <span
                  className={`tabular-nums font-semibold ${
                    db >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {Number.isFinite(db) ? db.toFixed(2) : '—'}
                </span>
                {totalSale > 0 && (
                  <span className="text-[10px] text-gray-500">
                    ({dbPct.toFixed(1)} %)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Receipt fields — manual paste for now, upload UI later */}
          <details className="rounded ring-1 ring-gray-200 bg-white text-xs">
            <summary className="cursor-pointer px-3 py-1.5 text-gray-600 hover:text-gray-900 select-none">
              Bilag / kvittering (valgfri)
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  URL til bilag
                </label>
                <input
                  type="url"
                  value={form.receipt_url}
                  onChange={(e) => update('receipt_url', e.target.value)}
                  placeholder="https://…"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filnavn</label>
                <input
                  type="text"
                  value={form.receipt_filename}
                  onChange={(e) => update('receipt_filename', e.target.value)}
                  placeholder="kvittering-2026-05-04.pdf"
                  className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Upload-knap kommer i en senere sprint. Indtast URL + filnavn manuelt indtil da.
              </p>
            </div>
          </details>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Valgfri (f.eks. ordrenummer, godkendt af, …)"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
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
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1"
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            {editing ? 'Gem ændringer' : 'Tilføj'}
          </button>
        </div>
      </div>
    </div>
  )
}
