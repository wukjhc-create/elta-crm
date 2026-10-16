'use client'

/**
 * Sprint 5B — Add / edit dialog for case_materials.
 *
 * W-3 (pilot-review 2026-10-15): ved "Tilføj" kan varen søges i leverandørkataloget (varenr./navn/EAN) — udfylder
 * beskrivelse, varenr., leverandør, enhed og (med kost-ret) priser og kobler supplier_product_id. Manuel indtastning
 * virker som før.
 */

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertCircle, Search } from 'lucide-react'
import {
  createCaseMaterial,
  updateCaseMaterial,
} from '@/lib/actions/case-materials'
import { searchProductsForCaseMaterialAction, type CaseMaterialProductHit } from '@/lib/actions/case-material-search'
import type { CaseMaterialRow } from '@/types/case-materials.types'
import { toNumberDa } from '@/lib/utils/danish-number'
import { humanizeErrorText } from '@/lib/auth/permission-text'

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
  showPrices = true,
}: {
  open: boolean
  caseId: string
  editing: CaseMaterialRow | null
  onClose: () => void
  onSaved: () => void
  /** Uden kost-ret (montør): ingen prisfelter — serveren gemmer 0, kontoret prissætter. */
  showPrices?: boolean
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const [supplierProductId, setSupplierProductId] = useState<string | null>(null)
  const [productQuery, setProductQuery] = useState('')
  const [productHits, setProductHits] = useState<CaseMaterialProductHit[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)
  const productSeq = useRef(0)

  // Leverandørsøgning (kun ved Tilføj) — debounced, kun seneste svar vises
  useEffect(() => {
    if (!open || editing) return
    const q = productQuery.trim()
    const seq = ++productSeq.current
    setProductError(null)
    if (q.length < 2) { setProductHits([]); setProductSearching(false); return }
    const t = setTimeout(async () => {
      setProductSearching(true)
      try {
        const res = await searchProductsForCaseMaterialAction(caseId, q)
        if (seq !== productSeq.current) return
        if (res.success) setProductHits(res.data ?? [])
        else { setProductHits([]); setProductError(res.error ?? 'Søgningen fejlede') }
      } catch {
        if (seq === productSeq.current) { setProductHits([]); setProductError('Søgningen fejlede — prøv igen') }
      } finally {
        if (seq === productSeq.current) setProductSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [productQuery, open, editing, caseId])

  // Reset form on open / editing change
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setSupplierProductId(null)
    setProductQuery('')
    setProductHits([])
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

  const parsedQty = toNumberDa(form.quantity)
  const parsedCost = toNumberDa(form.unit_cost)
  const parsedSale = toNumberDa(form.unit_sales_price)
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
      : await createCaseMaterial({ ...payload, case_id: caseId, source: 'manual', supplier_product_id: supplierProductId })

    if (!res.success) {
      setSubmitting(false)
      setError(humanizeErrorText(res.error) ?? 'Kunne ikke gemme materiale')
      return
    }

    onSaved()
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    // Ændres varenr./leverandør efter et katalogvalg, er rækken ikke længere den valgte vare
    if (key === 'sku_snapshot' || key === 'supplier_name_snapshot') setSupplierProductId(null)
  }

  const pickProduct = (h: CaseMaterialProductHit) => {
    setForm((f) => ({
      ...f,
      description: h.name || f.description,
      sku_snapshot: h.sku,
      supplier_name_snapshot: h.supplier_name,
      unit: h.unit || f.unit,
      unit_cost: h.unit_cost !== null ? String(h.unit_cost).replace('.', ',') : f.unit_cost,
      unit_sales_price: h.unit_sales_price !== null ? String(h.unit_sales_price).replace('.', ',') : f.unit_sales_price,
    }))
    setSupplierProductId(h.supplier_product_id)
    setProductQuery('')
    setProductHits([])
  }
  const unitOptions = UNIT_OPTIONS.includes(form.unit) ? UNIT_OPTIONS : [form.unit, ...UNIT_OPTIONS]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-4 py-4 overflow-y-auto"
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
          {!editing && (
            <div className="rounded border border-blue-100 bg-blue-50/40 p-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Søg i leverandørkatalog</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Varenr., navn eller EAN"
                  className="w-full border rounded pl-8 pr-8 py-1.5 text-sm bg-white"
                  data-testid="case-material-product-search"
                />
                {productSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />}
              </div>
              {productError && <p className="mt-1 text-xs text-red-600" role="alert">{productError}</p>}
              {productHits.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-y-auto divide-y rounded border bg-white" data-testid="case-material-product-hits">
                  {productHits.map((h) => (
                    <li key={h.supplier_product_id}>
                      <button
                        type="button"
                        onClick={() => pickProduct(h)}
                        className="w-full text-left px-2 py-2 hover:bg-blue-50 text-sm"
                      >
                        <span className="block font-medium text-gray-900 truncate">{h.name}</span>
                        <span className="block text-xs text-gray-500">
                          {h.supplier_name} · {h.sku} · {h.unit}
                          {h.unit_cost !== null && ` · kost ${h.unit_cost.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {productQuery.trim().length >= 2 && !productSearching && !productError && productHits.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">Ingen varer fundet — udfyld felterne manuelt</p>
              )}
              {supplierProductId && <p className="mt-1 text-xs text-green-700" data-testid="case-material-linked">Koblet til katalogvaren</p>}
            </div>
          )}
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
                {unitOptions.map((u) => (
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

          {showPrices ? (
          <>
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
          </>
          ) : (
            <p className="text-xs text-gray-500 rounded bg-gray-50 ring-1 ring-gray-200 px-3 py-2" data-testid="material-price-note">
              Registrér hvad der er brugt — priser sættes af kontoret.
            </p>
          )}

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
