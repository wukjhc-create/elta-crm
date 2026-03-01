'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, Plus, GripVertical, Search, Loader2, Package, Wifi, Database, Check, Truck } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import {
  computeOfferDB,
  getLineItemMargin,
  calculateSalePrice,
  calculateLineTotal,
  calculateDBPercentage,
  getDBBadgeClasses,
  getDBAmountColor,
  isDBBelowSendThreshold,
  type LineItemForDB,
  type DBThresholds,
} from '@/lib/logic/pricing'

// =====================================================
// Universal Line Items Table (Inline Editable)
// Used by: Offer detail, Mail quote editor, Project detail
// =====================================================

export interface LineItemRow extends LineItemForDB {
  id: string
  position?: number
  description: string
  unit?: string
  image_url?: string | null
  line_type?: string | null
  supplier_name_at_creation?: string | null
}

/** Data needed to save a line item */
export interface LineItemSaveData {
  id?: string // undefined = new item
  description: string
  quantity: number
  unit: string
  unit_price: number
  cost_price: number | null
  supplier_margin_applied: number | null
  discount_percentage?: number
}

interface LineItemsTableProps {
  items: LineItemRow[]
  offerId?: string
  currency?: string
  showCostData?: boolean
  showDBSummary?: boolean
  thresholds?: DBThresholds
  /** Enable inline editing */
  editable?: boolean
  /** Called when a row is saved (blur/enter). Return true on success. */
  onSaveItem?: (data: LineItemSaveData) => Promise<boolean>
  /** Called when a row is deleted */
  onDeleteItem?: (id: string) => Promise<boolean>
  /** Render custom actions per row (only used when editable=false) */
  renderActions?: (item: LineItemRow) => React.ReactNode
}

// =====================================================
// Editable Row Component
// =====================================================

/** Small badge showing which wholesaler provided this line */
function SupplierBadge({ name }: { name?: string | null }) {
  if (!name) return null
  const code = name.toUpperCase()
  const isAO = code.includes('AO')
  const isLM = code.includes('LM') || code.includes('LEMVIGH') || code.includes('MÜLLER') || code.includes('MULLER')
  const bg = isAO ? 'bg-orange-100 text-orange-700' : isLM ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
  const label = isAO ? 'AO' : isLM ? 'LM' : name.slice(0, 3).toUpperCase()
  return (
    <span className={`inline-flex text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${bg}`}>
      {label}
    </span>
  )
}

interface EditableRowProps {
  item: LineItemRow
  idx: number
  currency: string
  thresholds?: DBThresholds
  onSave: (data: LineItemSaveData) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

function EditableRow({ item, idx, currency, thresholds, onSave, onDelete }: EditableRowProps) {
  const [description, setDescription] = useState(item.description)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit || 'stk')
  const [costPrice, setCostPrice] = useState(
    String(item.cost_price || item.supplier_cost_price_at_creation || '')
  )
  const [marginPct, setMarginPct] = useState(
    String(item.supplier_margin_applied ?? '')
  )
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price))
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Compute live values
  const qty = parseFloat(quantity) || 0
  const cost = parseFloat(costPrice) || 0
  const margin = parseFloat(marginPct)
  const sale = parseFloat(unitPrice) || 0
  const total = calculateLineTotal(qty, sale)
  const effectiveMargin = cost > 0 && sale > 0
    ? Math.round((sale / cost - 1) * 100)
    : null

  // Auto-calculate sale price when cost or margin changes
  const recalcSalePrice = useCallback((newCost: string, newMargin: string) => {
    const c = parseFloat(newCost)
    const m = parseFloat(newMargin)
    if (!isNaN(c) && c > 0 && !isNaN(m)) {
      const newSale = calculateSalePrice(c, m)
      setUnitPrice(String(newSale))
      setIsDirty(true)
    }
  }, [])

  const handleCostChange = (val: string) => {
    setCostPrice(val)
    setIsDirty(true)
    recalcSalePrice(val, marginPct)
  }

  const handleMarginChange = (val: string) => {
    setMarginPct(val)
    setIsDirty(true)
    recalcSalePrice(costPrice, val)
  }

  const handleSalePriceChange = (val: string) => {
    setUnitPrice(val)
    setIsDirty(true)
    // Reverse-calculate margin from new sale price
    const c = parseFloat(costPrice)
    const s = parseFloat(val)
    if (!isNaN(c) && c > 0 && !isNaN(s) && s > 0) {
      const newMargin = Math.round((s / c - 1) * 100)
      setMarginPct(String(newMargin))
    }
  }

  const doSave = useCallback(async () => {
    if (!isDirty || isSaving) return
    setIsSaving(true)
    await onSave({
      id: item.id,
      description,
      quantity: parseFloat(quantity) || 1,
      unit,
      unit_price: parseFloat(unitPrice) || 0,
      cost_price: parseFloat(costPrice) || null,
      supplier_margin_applied: parseFloat(marginPct) || null,
    })
    setIsDirty(false)
    setIsSaving(false)
  }, [isDirty, isSaving, item.id, description, quantity, unit, unitPrice, costPrice, marginPct, onSave])

  // Auto-save on blur with debounce
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      doSave()
    }, 300)
  }, [doSave])

  // Save on Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      doSave()
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    await onDelete(item.id)
    setIsDeleting(false)
  }

  const inputClass = 'w-full bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 outline-none px-1 py-1 text-sm transition-colors'

  return (
    <tr className={`border-b hover:bg-blue-50/30 group ${isSaving ? 'opacity-70' : ''}`}>
      <td className="py-1.5 px-1 text-gray-400 text-center text-xs w-8">
        <GripVertical className="w-3.5 h-3.5 text-gray-300 mx-auto" />
      </td>
      <td className="py-1.5 px-1">
        <div className="flex items-center gap-1.5">
          {item.image_url && (
            <img
              src={item.image_url}
              alt=""
              className="w-7 h-7 rounded object-contain border bg-white shrink-0"
            />
          )}
          <SupplierBadge name={item.supplier_name_at_creation} />
          <input
            type="text"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setIsDirty(true) }}
            onBlur={scheduleAutoSave}
            onKeyDown={handleKeyDown}
            placeholder="Beskrivelse..."
            className={`${inputClass} font-medium`}
          />
        </div>
      </td>
      <td className="py-1.5 px-1 w-16">
        <input
          type="number"
          value={quantity}
          onChange={(e) => { setQuantity(e.target.value); setIsDirty(true) }}
          onBlur={scheduleAutoSave}
          onKeyDown={handleKeyDown}
          min="0"
          step="0.01"
          className={`${inputClass} text-right`}
        />
      </td>
      <td className="py-1.5 px-1 w-16">
        <select
          value={unit}
          onChange={(e) => { setUnit(e.target.value); setIsDirty(true); scheduleAutoSave() }}
          className="w-full bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 outline-none px-0 py-1 text-sm text-gray-600 cursor-pointer"
        >
          <option value="stk">Stk.</option>
          <option value="time">Time</option>
          <option value="m">Meter</option>
          <option value="m2">m²</option>
          <option value="kWp">kWp</option>
          <option value="sæt">Sæt</option>
          <option value="pakke">Pakke</option>
          <option value="kg">Kg</option>
          <option value="l">Liter</option>
        </select>
      </td>
      <td className="py-1.5 px-1 w-24">
        <input
          type="number"
          value={costPrice}
          onChange={(e) => handleCostChange(e.target.value)}
          onBlur={scheduleAutoSave}
          onKeyDown={handleKeyDown}
          min="0"
          step="0.01"
          placeholder="0"
          className={`${inputClass} text-right text-gray-600`}
        />
      </td>
      <td className="py-1.5 px-1 w-20">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            value={marginPct}
            onChange={(e) => handleMarginChange(e.target.value)}
            onBlur={scheduleAutoSave}
            onKeyDown={handleKeyDown}
            min="0"
            step="0.5"
            placeholder="0"
            className={`${inputClass} text-right w-14`}
          />
          {effectiveMargin != null && (
            <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${getDBBadgeClasses(effectiveMargin, thresholds)}`}>
              {effectiveMargin}%
            </span>
          )}
        </div>
      </td>
      <td className="py-1.5 px-1 w-24">
        <input
          type="number"
          value={unitPrice}
          onChange={(e) => handleSalePriceChange(e.target.value)}
          onBlur={scheduleAutoSave}
          onKeyDown={handleKeyDown}
          min="0"
          step="0.01"
          className={`${inputClass} text-right font-medium`}
        />
      </td>
      <td className="py-1.5 px-2 text-right font-semibold text-gray-900 text-sm w-28">
        {formatCurrency(total, currency, 2)}
      </td>
      <td className="py-1.5 px-1 w-10">
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="p-1 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          aria-label="Slet linje"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </button>
      </td>
    </tr>
  )
}

// =====================================================
// Read-only Row Component
// =====================================================

function ReadOnlyRow({
  item,
  idx,
  currency,
  showCostData,
  thresholds,
  renderActions,
}: {
  item: LineItemRow
  idx: number
  currency: string
  showCostData: boolean
  thresholds?: DBThresholds
  renderActions?: (item: LineItemRow) => React.ReactNode
}) {
  const costPrice = item.cost_price || item.supplier_cost_price_at_creation || null
  const marginPct = getLineItemMargin(item)

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-2.5 px-2 text-gray-400 text-sm">{item.position ?? idx + 1}</td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-2">
          {item.image_url && (
            <img src={item.image_url} alt="" className="w-8 h-8 rounded object-contain border bg-white shrink-0" />
          )}
          <SupplierBadge name={item.supplier_name_at_creation} />
          <span className="font-medium text-gray-900 text-sm">{item.description}</span>
        </div>
      </td>
      <td className="py-2.5 px-2 text-right text-gray-700 text-sm">{item.quantity}</td>
      <td className="py-2.5 px-2 text-gray-500 text-sm">{item.unit || 'stk'}</td>
      {showCostData && (
        <>
          <td className="py-2.5 px-2 text-right text-gray-500 text-sm">
            {costPrice ? formatCurrency(costPrice, currency, 2) : <span className="text-gray-300">-</span>}
          </td>
          <td className="py-2.5 px-2 text-right">
            {marginPct != null ? (
              <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${getDBBadgeClasses(marginPct, thresholds)}`}>
                {marginPct}%
              </span>
            ) : <span className="text-gray-300 text-sm">-</span>}
          </td>
        </>
      )}
      <td className="py-2.5 px-2 text-right text-gray-700 text-sm">{formatCurrency(item.unit_price, currency, 2)}</td>
      <td className="py-2.5 px-2 text-right font-semibold text-gray-900 text-sm">{formatCurrency(item.total, currency, 2)}</td>
      {renderActions && <td className="py-2.5 px-2 text-right">{renderActions(item)}</td>}
    </tr>
  )
}

// =====================================================
// Main Table Component
// =====================================================

export function LineItemsTable({
  items,
  offerId,
  currency = 'DKK',
  showCostData = true,
  showDBSummary = true,
  thresholds,
  editable = false,
  onSaveItem,
  onDeleteItem,
  renderActions,
}: LineItemsTableProps) {
  // For editable mode: compute DB from live values
  const db = computeOfferDB(items)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-8">#</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Beskrivelse</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Antal</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Enhed</th>
              {showCostData && (
                <>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Kostpris</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Avance</th>
                </>
              )}
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Salgspris</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Total</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {editable && onSaveItem && onDeleteItem ? (
              items.map((item, idx) => (
                <EditableRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  currency={currency}
                  thresholds={thresholds}
                  onSave={onSaveItem}
                  onDelete={onDeleteItem}
                />
              ))
            ) : (
              items.map((item, idx) => (
                <ReadOnlyRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  currency={currency}
                  showCostData={showCostData}
                  thresholds={thresholds}
                  renderActions={renderActions}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add new line button (editable mode) */}
      {editable && onSaveItem && (
        <button
          onClick={async () => {
            const nextPos = items.length > 0 ? Math.max(...items.map(i => i.position ?? 0)) + 1 : 1
            await onSaveItem({
              description: '',
              quantity: 1,
              unit: 'stk',
              unit_price: 0,
              cost_price: null,
              supplier_margin_applied: null,
            })
          }}
          className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tilføj linje
        </button>
      )}

      {/* DB Summary Footer */}
      {showDBSummary && items.length > 0 && db.hasAnyCost && (
        <div className="mt-3 pt-3 border-t">
          <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-gray-50 border">
            <span className="text-gray-600 font-medium">Samlet dækningsbidrag:</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">
                Kostpris: {formatCurrency(db.totalCost, currency, 2)}
              </span>
              <span className={`font-bold text-base ${getDBAmountColor(db.dbPercentage, thresholds)}`}>
                {formatCurrency(db.dbAmount, currency, 2)}
              </span>
              <span className={`inline-flex text-sm font-bold px-2.5 py-1 rounded-full ${getDBBadgeClasses(db.dbPercentage, thresholds)}`}>
                {db.dbPercentage}%
              </span>
            </div>
          </div>

          {/* Red warning when below send threshold */}
          {isDBBelowSendThreshold(db.dbPercentage, thresholds) && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
              <span className="text-sm text-red-700 font-medium">
                Dækningsbidraget er under minimumstærsklen. Tilbuddet kan ikke sendes.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
