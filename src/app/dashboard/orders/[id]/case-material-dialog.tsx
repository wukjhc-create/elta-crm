'use client'

/**
 * Sprint 5B — Add / edit dialog for case_materials.
 *
 * Manual entry only in this commit. Supplier/material picker may be
 * added in a follow-up commit if it doesn't bloat the bundle. The
 * fields here are sufficient to register a snapshot booking against
 * a sag and let the summary roll up cost / sale / DB.
 */

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  createCaseMaterial,
  updateCaseMaterial,
} from '@/lib/actions/case-materials'
import type { CaseMaterialRow } from '@/types/case-materials.types'

interface FormState {
  description: string
  sku_snapshot: string
  supplier_name_snapshot: string
  unit: string
  quantity: string                 // string in form, parsed on submit
  unit_cost: string
  unit_sales_price: string
  billable: boolean
  notes: string
}

const EMPTY: FormState = {
  description: '',
  sku_snapshot: '',
  supplier_name_snapshot: '',
  unit: 'stk',
  quantity: '1',
  unit_cost: '0',
  unit_sales_price: '0',
  billable: true,
  notes: '',
}

const UNIT_OPTIONS = ['stk', 'm', 'm²', 'm³', 'kg', 'sæt', 'pakke', 'time', 'rulle', 'pose']

export function CaseMaterialDialog({
  open,
  caseId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  caseId: string
  editing: CaseMaterialRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)

  // Reset form on open / editing change
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    if (editing) {
      setForm({
        description: editing.description,
        sku_snapshot: editing.sku_snapshot ?? '',
        supplier_name_snapshot: editing.supplier_name_snapshot ?? '',
        unit: editing.unit,
        quantity: String(editing.quantity),
        unit_cost: String(editing.unit_cost),
        unit_sales_price: String(editing.unit_sales_price),
        billable: editing.billable,
        notes: editing.notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, editing])

  // Esc to close
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
    !submitting

  const handleSubmit = async () => {
    setError(null)
    if (!canSubmit) {
      setError('Tjek antal, kostpris og salgspris')
      return
    }
    setSubmitting(true)

    const payload = {
      description: form.description.trim(),
      sku_snapshot: form.sku_snapshot.trim() || null,
      supplier_name_snapshot: form.supplier_name_snapshot.trim() || null,
      unit: form.unit.trim() || 'stk',
      quantity: parsedQty,
      unit_cost: parsedCost,
      unit_sales_price: parsedSale,
      billable: form.billable,
      notes: form.notes.trim() || null,
    }

    const res = editing
      ? await updateCaseMaterial(editing.id, payload)
      : await createCaseMaterial({ ...payload, case_id: caseId, source: 'manual' })

    if (!res.success) {
      setSubmitting(false)
      setError(res.error ?? 'Kunne ikke gemme materiale')
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
        aria-labelledby="case-material-dialog-title"
        className="w-full max-w-xl rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="case-material-dialog-title" className="text-base font-semibold text-gray-900">
            {editing ? 'Rediger materiale' : 'Tilføj materiale'}
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
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Beskrivelse <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={400}
              placeholder="F.eks. Solpanel 425W LR4-72HPH"
              className="w-full border rounded px-2 py-1.5 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
              <input
                type="text"
                value={form.sku_snapshot}
                onChange={(e) => update('sku_snapshot', e.target.value)}
                maxLength={120}
                placeholder="Valgfri"
                className="w-full border rounded px-2 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Leverandør
              </label>
              <input
                type="text"
                value={form.supplier_name_snapshot}
                onChange={(e) => update('supplier_name_snapshot', e.target.value)}
                maxLength={120}
                placeholder="Valgfri (AO, LM, …)"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
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

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Valgfri note (placering, lot-nummer, etc.)"
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
