'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Star } from 'lucide-react'
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
  is_cheapest?: boolean
  alternatives?: Array<{
    supplier_code: string
    supplier_name: string
    cost_price: number
    supplier_sku: string
    id: string
  }>
}

interface SupplierProductSearchProps {
  onSelect: (product: SupplierProductResult) => void
  customerId?: string
  supplierId?: string
  placeholder?: string
}

/** Supplier badge: AO = orange, LM = blue */
function SupplierBadge({ code }: { code: string }) {
  const colors = code === 'AO'
    ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-blue-100 text-blue-700 border-blue-200'
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${colors}`}>
      {code}
    </span>
  )
}

export function SupplierProductSearch({
  onSelect,
  customerId,
  supplierId,
  placeholder = 'Søg leverandørprodukter (AO + Lemu)...',
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
      limit: 20,
    })

    if (result.success && result.data) {
      setResults(result.data as SupplierProductResult[])
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
              className={`w-full text-left px-3 py-2 border-b last:border-0 text-sm transition-colors ${
                product.is_cheapest
                  ? 'bg-green-50 hover:bg-green-100'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => handleSelect(product)}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <SupplierBadge code={product.supplier_code} />
                    <span className="font-medium truncate text-sm">{product.product_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <span className="font-mono">{product.supplier_sku}</span>
                    {!product.is_available && (
                      <span className="text-red-500 font-medium">Ikke tilgængelig</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1">
                    {product.is_cheapest && <Star className="w-3 h-3 text-green-500 fill-green-500" />}
                    <span className={`text-sm font-semibold ${product.is_cheapest ? 'text-green-700' : 'text-gray-700'}`}>
                      {product.cost_price.toLocaleString('da-DK', { minimumFractionDigits: 2 })} kr
                    </span>
                  </div>
                  <div className="text-xs text-green-600">
                    Salg: {product.estimated_sale_price.toLocaleString('da-DK', { minimumFractionDigits: 2 })} kr
                  </div>
                  {/* Alternative supplier prices */}
                  {product.alternatives && product.alternatives.length > 0 && (
                    <div className="mt-0.5">
                      {product.alternatives.map(alt => (
                        <div key={alt.id} className="flex items-center justify-end gap-1 text-[10px]">
                          <SupplierBadge code={alt.supplier_code} />
                          <span className="text-gray-400">
                            {alt.cost_price.toLocaleString('da-DK', { minimumFractionDigits: 2 })} kr
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
