'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { searchSupplierProductsForOffer } from '@/lib/actions/offers'

interface SupplierProductResult {
  id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  margin_percentage: number
  estimated_sale_price: number
  unit: string
  is_available: boolean
}

interface SupplierProductSearchProps {
  onSelect: (product: SupplierProductResult) => void
  customerId?: string
  supplierId?: string
  placeholder?: string
}

export function SupplierProductSearch({
  onSelect,
  customerId,
  supplierId,
  placeholder = 'Søg leverandørprodukter...',
}: SupplierProductSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierProductResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setIsSearching(true)
    const result = await searchSupplierProductsForOffer(searchQuery, {
      customerId,
      supplierId,
      limit: 15,
    })

    if (result.success && result.data) {
      setResults(result.data)
      setShowResults(true)
    }
    setIsSearching(false)
  }, [customerId, supplierId])

  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }
    searchTimeout.current = setTimeout(() => doSearch(value), 300)
  }, [doSearch])

  const handleSelect = useCallback((product: SupplierProductResult) => {
    onSelect(product)
    setQuery('')
    setResults([])
    setShowResults(false)
  }, [onSelect])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder={placeholder}
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowResults(true)}
      />

      {isSearching && (
        <div className="absolute right-3 top-2.5">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}

      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.map((product) => (
            <button
              key={product.id}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm"
              onClick={() => handleSelect(product)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{product.product_name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{product.supplier_name}</span>
                    <span>|</span>
                    <span>{product.supplier_sku}</span>
                    {!product.is_available && (
                      <span className="text-red-500 font-medium">Ikke tilgængelig</span>
                    )}
                  </div>
                </div>
                <div className="text-right ml-3">
                  <div className="font-medium text-green-700">
                    {product.estimated_sale_price.toLocaleString('da-DK')} kr
                  </div>
                  <div className="text-xs text-gray-400">
                    Kost: {product.cost_price.toLocaleString('da-DK')} kr
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-4 text-sm text-gray-500 text-center">
          Ingen produkter fundet for &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}
