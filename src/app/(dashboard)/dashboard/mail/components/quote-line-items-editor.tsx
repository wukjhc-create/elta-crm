'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, Search, Loader2, TrendingUp, Wifi, Database, Package, CheckCircle2, Clock } from 'lucide-react'
import type { QuoteLineItem } from '@/types/quote-templates.types'
import { OFFER_UNITS } from '@/types/offers.types'
import { formatCurrency } from '@/lib/utils/format'
import { searchSupplierProductsForOffer, searchSupplierProductsLive } from '@/lib/actions/offers'

interface QuoteLineItemsEditorProps {
  items: QuoteLineItem[]
  onChange: (items: QuoteLineItem[]) => void
}

type SupplierProduct = {
  id?: string
  supplier_sku: string
  product_name: string
  supplier_name: string
  supplier_code: string
  list_price: number | null
  cost_price: number
  estimated_sale_price: number
  unit: string
  is_available?: boolean
  stock_quantity?: number | null
  delivery_days?: number | null
  image_url?: string | null
  source?: 'live' | 'cache'
}

export function QuoteLineItemsEditor({ items, onChange }: QuoteLineItemsEditorProps) {
  const [searchMode, setSearchMode] = useState<'local' | 'live'>('live')

  const addLine = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        description: '',
        quantity: 1,
        unit: 'stk',
        unitPrice: 0,
      },
    ])
  }

  const addSection = () => {
    const sectionName = prompt('Sektionsnavn (f.eks. "Materialer", "Arbejdsløn"):')
    if (!sectionName) return

    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        description: '',
        quantity: 1,
        unit: 'stk',
        unitPrice: 0,
        section: sectionName,
      },
    ])
  }

  const updateItem = (index: number, field: keyof QuoteLineItem, value: string | number) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item
      return { ...item, [field]: value }
    })
    onChange(updated)
  }

  const handleProductSelect = (index: number, product: SupplierProduct) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        description: product.product_name,
        unitPrice: product.estimated_sale_price || product.list_price || product.cost_price,
        unit: product.unit || 'stk',
        costPrice: product.cost_price,
        listPrice: product.list_price ?? undefined,
        supplierSku: product.supplier_sku,
        supplierName: product.supplier_name,
      }
    })
    onChange(updated)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  // Dækningsbidrag
  const totalCost = items.reduce((sum, item) => sum + (item.costPrice || 0) * item.quantity, 0)
  const hasCostData = items.some((item) => item.costPrice && item.costPrice > 0)
  const contributionMargin = subtotal - totalCost
  const contributionPct = subtotal > 0 ? (contributionMargin / subtotal) * 100 : 0

  // Track sections for display
  let currentSection = ''

  return (
    <div className="space-y-3">
      {/* Search mode toggle */}
      <div className="flex items-center gap-2 pb-1">
        <span className="text-xs text-gray-500">Søgning:</span>
        <button
          type="button"
          onClick={() => setSearchMode('live')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
            searchMode === 'live'
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-gray-100 text-gray-500 border border-transparent hover:bg-gray-200'
          }`}
        >
          <Wifi className="w-3 h-3" /> Live API
        </button>
        <button
          type="button"
          onClick={() => setSearchMode('local')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
            searchMode === 'local'
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-100 text-gray-500 border border-transparent hover:bg-gray-200'
          }`}
        >
          <Database className="w-3 h-3" /> Lokal DB
        </button>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_60px_80px_90px_90px_70px_32px] gap-2 text-xs font-medium text-gray-500 px-1">
        <div>Beskrivelse</div>
        <div className="text-right">Antal</div>
        <div>Enhed</div>
        <div className="text-right">Vejl. pris</div>
        <div className="text-right">Enhedspris</div>
        <div className="text-right">Total</div>
        <div />
      </div>

      {/* Items */}
      {items.map((item, index) => {
        const showSection = item.section && item.section !== currentSection
        if (item.section) currentSection = item.section
        const lineTotal = item.quantity * item.unitPrice

        return (
          <div key={item.id}>
            {/* Section header */}
            {showSection && (
              <div className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded mt-2 mb-1">
                {item.section}
              </div>
            )}

            <div className="grid grid-cols-[1fr_60px_80px_90px_90px_70px_32px] gap-2 items-start">
              {/* Description + supplier info */}
              <div>
                <DescriptionInput
                  value={item.description}
                  onChange={(val) => updateItem(index, 'description', val)}
                  onProductSelect={(product) => handleProductSelect(index, product)}
                  searchMode={searchMode}
                />
                {item.supplierSku && (
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <span className="text-[10px] text-gray-400 truncate">
                      {item.supplierSku} | {item.supplierName}
                      {item.costPrice ? ` | Netto: ${formatCurrency(item.costPrice, 'DKK', 2)}` : ''}
                    </span>
                  </div>
                )}
              </div>

              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                min={0}
                step={1}
                className="px-2 py-1.5 border rounded text-sm text-right"
              />
              <select
                value={item.unit}
                onChange={(e) => updateItem(index, 'unit', e.target.value)}
                className="px-2 py-1.5 border rounded text-sm"
              >
                {OFFER_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>

              {/* Vejledende pris */}
              <div className="text-right py-1.5 text-sm text-gray-400">
                {item.listPrice ? formatCurrency(item.listPrice, 'DKK', 0) : '—'}
              </div>

              <input
                type="number"
                value={item.unitPrice}
                onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                min={0}
                step={0.01}
                className="px-2 py-1.5 border rounded text-sm text-right"
              />
              <div className="text-right text-sm font-medium text-gray-700 py-1.5">
                {formatCurrency(lineTotal, 'DKK', 0)}
              </div>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                title="Slet linje"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      })}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 rounded hover:bg-gray-50 text-gray-600"
        >
          <Plus className="w-3.5 h-3.5" /> Tilføj linje
        </button>
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dashed border-blue-300 rounded hover:bg-blue-50 text-blue-600"
        >
          <Plus className="w-3.5 h-3.5" /> Tilføj sektion
        </button>
      </div>

      {/* Subtotal + Dækningsbidrag */}
      <div className="pt-3 border-t space-y-1">
        <div className="flex justify-end">
          <div className="text-sm">
            <span className="text-gray-500 mr-3">Subtotal:</span>
            <span className="font-semibold">{formatCurrency(subtotal, 'DKK', 2)}</span>
          </div>
        </div>

        {hasCostData && (
          <div className="flex justify-end">
            <div className="text-sm space-y-0.5 text-right border-t border-dashed pt-1 mt-1">
              <div>
                <span className="text-gray-400 mr-3">Indkøb (netto):</span>
                <span className="text-gray-500">{formatCurrency(totalCost, 'DKK', 2)}</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <TrendingUp className={`w-3.5 h-3.5 ${contributionPct >= 20 ? 'text-green-500' : contributionPct >= 10 ? 'text-amber-500' : 'text-red-500'}`} />
                <span className="text-gray-500 mr-3">Dækningsbidrag:</span>
                <span className={`font-semibold ${contributionPct >= 20 ? 'text-green-600' : contributionPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                  {formatCurrency(contributionMargin, 'DKK', 2)} ({contributionPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================
// Description input with product search autocomplete
// =====================================================

function DescriptionInput({
  value,
  onChange,
  onProductSelect,
  searchMode,
}: {
  value: string
  onChange: (val: string) => void
  onProductSelect: (product: SupplierProduct) => void
  searchMode: 'local' | 'live'
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [results, setResults] = useState<SupplierProduct[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([])
      setShowDropdown(false)
      setNoResults(false)
      return
    }

    setIsSearching(true)
    try {
      if (searchMode === 'live') {
        const result = await searchSupplierProductsLive(query, { limit: 10 })
        if (result.success && result.data) {
          setResults(result.data)
          setNoResults(result.data.length === 0)
          setShowDropdown(true)
        } else {
          setResults([])
          setNoResults(true)
          setShowDropdown(true)
        }
      } else {
        const result = await searchSupplierProductsForOffer(query, { limit: 8 })
        if (result.success && result.data) {
          setResults(result.data)
          setNoResults(result.data.length === 0)
          setShowDropdown(true)
        } else {
          setResults([])
          setNoResults(true)
          setShowDropdown(true)
        }
      }
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchMode])

  const handleChange = (newValue: string) => {
    onChange(newValue)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(newValue), searchMode === 'live' ? 500 : 300)
  }

  const handleSelect = (product: SupplierProduct) => {
    setShowDropdown(false)
    setResults([])
    onProductSelect(product)
  }

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
          placeholder={searchMode === 'live' ? 'Søg live i AO / LM...' : 'Søg produkt eller skriv beskrivelse...'}
          className="w-full px-2 py-1.5 pr-7 border rounded text-sm"
        />
        {isSearching ? (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        ) : value.length >= 2 ? (
          searchMode === 'live' ? (
            <Wifi className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-400" />
          ) : (
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
          )
        ) : null}
      </div>

      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-80 overflow-auto">
          {noResults && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              {searchMode === 'live' ? 'Ingen produkter fundet via API' : 'Ingen produkter fundet'}
            </div>
          ) : (
            results.map((product, idx) => (
              <button
                key={`${product.supplier_sku}-${product.supplier_code}-${idx}`}
                type="button"
                onClick={() => handleSelect(product)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  {/* Product image placeholder / icon */}
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      className="w-10 h-10 rounded border object-cover shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded border bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Package className="w-5 h-5 text-gray-300" />
                    </div>
                  )}

                  {/* Product info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.product_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-medium text-gray-500">{product.supplier_sku}</span>
                      <span className="text-[10px] text-gray-300">|</span>
                      <span className={`text-[10px] font-semibold ${
                        product.supplier_code === 'AO' ? 'text-orange-600' : 'text-blue-600'
                      }`}>
                        {product.supplier_name}
                      </span>
                      {product.source === 'live' && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 text-[9px] font-medium bg-green-100 text-green-700 rounded">
                          <Wifi className="w-2 h-2" /> Live
                        </span>
                      )}
                    </div>

                    {/* Stock and delivery info */}
                    {searchMode === 'live' && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {product.is_available !== undefined && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] ${
                            product.is_available ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {product.is_available ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {product.is_available
                              ? product.stock_quantity != null ? `${product.stock_quantity} stk` : 'På lager'
                              : 'Ikke på lager'}
                          </span>
                        )}
                        {product.delivery_days != null && product.delivery_days > 0 && (
                          <span className="text-[10px] text-gray-400">
                            {product.delivery_days} dages levering
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prices */}
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">
                      Netto: {formatCurrency(product.cost_price, 'DKK', 2)}
                    </p>
                    <p className="text-sm font-semibold text-green-700">
                      {formatCurrency(product.estimated_sale_price, 'DKK', 2)}
                    </p>
                    {product.list_price && product.list_price !== product.estimated_sale_price && (
                      <p className="text-[10px] text-gray-400">
                        Vejl: {formatCurrency(product.list_price, 'DKK', 0)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
