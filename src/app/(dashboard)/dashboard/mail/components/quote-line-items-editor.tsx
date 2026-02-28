'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, Search, Loader2 } from 'lucide-react'
import type { QuoteLineItem } from '@/types/quote-templates.types'
import { OFFER_UNITS } from '@/types/offers.types'
import { formatCurrency } from '@/lib/utils/format'
import { searchSupplierProductsForOffer } from '@/lib/actions/offers'

interface QuoteLineItemsEditorProps {
  items: QuoteLineItem[]
  onChange: (items: QuoteLineItem[]) => void
}

type SupplierProduct = {
  id: string
  supplier_sku: string
  product_name: string
  supplier_name: string
  supplier_code: string
  list_price: number | null
  cost_price: number
  estimated_sale_price: number
  unit: string
}

export function QuoteLineItemsEditor({ items, onChange }: QuoteLineItemsEditorProps) {
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
        unitPrice: product.list_price || product.estimated_sale_price || product.cost_price,
        unit: product.unit || 'stk',
      }
    })
    onChange(updated)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  // Track sections for display
  let currentSection = ''

  return (
    <div className="space-y-3">
      {/* Table header */}
      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
        <div className="col-span-5">Beskrivelse</div>
        <div className="col-span-1 text-right">Antal</div>
        <div className="col-span-2">Enhed</div>
        <div className="col-span-2 text-right">Enhedspris</div>
        <div className="col-span-1 text-right">Total</div>
        <div className="col-span-1" />
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

            <div className="grid grid-cols-12 gap-2 items-center">
              <DescriptionInput
                value={item.description}
                onChange={(val) => updateItem(index, 'description', val)}
                onProductSelect={(product) => handleProductSelect(index, product)}
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                min={0}
                step={1}
                className="col-span-1 px-2 py-1.5 border rounded text-sm text-right"
              />
              <select
                value={item.unit}
                onChange={(e) => updateItem(index, 'unit', e.target.value)}
                className="col-span-2 px-2 py-1.5 border rounded text-sm"
              >
                {OFFER_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={item.unitPrice}
                onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                min={0}
                step={0.01}
                className="col-span-2 px-2 py-1.5 border rounded text-sm text-right"
              />
              <div className="col-span-1 text-right text-sm font-medium text-gray-700">
                {formatCurrency(lineTotal, 'DKK', 0)}
              </div>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="col-span-1 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
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

      {/* Subtotal */}
      <div className="flex justify-end pt-3 border-t">
        <div className="text-sm">
          <span className="text-gray-500 mr-3">Subtotal:</span>
          <span className="font-semibold">{formatCurrency(subtotal, 'DKK', 2)}</span>
        </div>
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
}: {
  value: string
  onChange: (val: string) => void
  onProductSelect: (product: SupplierProduct) => void
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
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleChange = (newValue: string) => {
    onChange(newValue)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(newValue), 300)
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
    <div ref={containerRef} className="col-span-5 relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
          placeholder="Søg produkt eller skriv beskrivelse..."
          className="w-full px-2 py-1.5 pr-7 border rounded text-sm"
        />
        {isSearching ? (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        ) : value.length >= 2 ? (
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
        ) : null}
      </div>

      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-64 overflow-auto">
          {noResults && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Ingen produkter fundet</div>
          ) : (
            results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.product_name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {product.supplier_sku} — {product.supplier_name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-gray-700">
                      {formatCurrency(product.list_price || product.estimated_sale_price, 'DKK', 2)}
                    </p>
                    <p className="text-xs text-gray-400">{product.unit}</p>
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
