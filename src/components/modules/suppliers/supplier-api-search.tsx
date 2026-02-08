'use client'

import { useState, useCallback } from 'react'
import {
  Search,
  Download,
  RefreshCw,
  Check,
  AlertCircle,
  ArrowUpDown,
  Package,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  searchSupplierAPI,
  getLiveProductPrice,
  importProductsFromAPI,
  getProductPriceComparison,
} from '@/lib/actions/supplier-sync'

interface ProductPrice {
  sku: string
  name: string
  costPrice: number
  listPrice: number | null
  currency: string
  unit: string
  isAvailable: boolean
  stockQuantity: number | null
  leadTimeDays: number | null
}

interface PriceComparison {
  supplierId: string
  supplierName: string
  supplierCode: string
  price: ProductPrice
}

interface SupplierAPISearchProps {
  supplierId: string
  supplierName: string
}

export function SupplierAPISearch({ supplierId, supplierName }: SupplierAPISearchProps) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductPrice[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [refreshingSku, setRefreshingSku] = useState<string | null>(null)
  const [comparisons, setComparisons] = useState<Record<string, PriceComparison[]>>({})
  const [comparingProduct, setComparingProduct] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 2,
    }).format(price)
  }

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return

    setSearching(true)
    setHasSearched(true)
    setSelected(new Set())
    setComparisons({})

    try {
      const result = await searchSupplierAPI(supplierId, query.trim(), { limit: 30 })
      if (result.success && result.data) {
        setResults(result.data)
        if (result.data.length === 0) {
          toast.info('Ingen produkter fundet')
        }
      } else {
        toast.error(result.error || 'Søgefejl')
        setResults([])
      }
    } catch {
      toast.error('Kunne ikke søge')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [supplierId, query, toast])

  const handleRefreshPrice = async (sku: string) => {
    setRefreshingSku(sku)
    try {
      const result = await getLiveProductPrice(supplierId, sku)
      if (result.success && result.data) {
        setResults(prev => prev.map(p =>
          p.sku === sku ? result.data! : p
        ))
        toast.success('Pris opdateret')
      } else {
        toast.error(result.error || 'Kunne ikke hente pris')
      }
    } catch {
      toast.error('Kunne ikke opdatere pris')
    } finally {
      setRefreshingSku(null)
    }
  }

  const handleImport = async () => {
    const productsToImport = results.filter(p => selected.has(p.sku))
    if (productsToImport.length === 0) {
      toast.error('Vælg mindst ét produkt')
      return
    }

    setImporting(true)
    try {
      const result = await importProductsFromAPI(supplierId, productsToImport)
      if (result.success && result.data) {
        const { imported, updated } = result.data
        toast.success(`${imported} nye produkter importeret, ${updated} opdateret`)
        setSelected(new Set())
      } else {
        toast.error(result.error || 'Importfejl')
      }
    } catch {
      toast.error('Kunne ikke importere produkter')
    } finally {
      setImporting(false)
    }
  }

  const handleCompare = async (productName: string) => {
    setComparingProduct(productName)
    try {
      const result = await getProductPriceComparison(productName)
      if (result.success && result.data) {
        setComparisons(prev => ({ ...prev, [productName]: result.data! }))
      } else {
        toast.error(result.error || 'Kunne ikke sammenligne priser')
      }
    } catch {
      toast.error('Sammenligningsfejl')
    } finally {
      setComparingProduct(null)
    }
  }

  const toggleSelect = (sku: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(sku)) {
        next.delete(sku)
      } else {
        next.add(sku)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map(p => p.sku)))
    }
  }

  return (
    <div className="space-y-6">
      {/* Search form */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">
          Søg i {supplierName}&apos;s API
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Søg efter produkter direkte i leverandørens produktkatalog via API.
          Vælg produkter og importer dem til dit produktbibliotek.
        </p>

        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Søg efter produktnavn, SKU eller beskrivelse..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Søg
          </Button>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="bg-white rounded-lg border">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {results.length} {results.length === 1 ? 'resultat' : 'resultater'}
              </span>
              {selected.size > 0 && (
                <Badge variant="secondary">{selected.size} valgt</Badge>
              )}
            </div>
            {selected.size > 0 && (
              <Button onClick={handleImport} disabled={importing} size="sm">
                {importing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Importer {selected.size} {selected.size === 1 ? 'produkt' : 'produkter'}
              </Button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Ingen produkter fundet for &quot;{query}&quot;</p>
              <p className="text-sm text-gray-400 mt-1">
                Prøv at søge med andre søgeord
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selected.size === results.length && results.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Produkt</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Kostpris</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Listepris</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Enhed</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Tilgængelig</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Handlinger</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((product) => (
                    <tr
                      key={product.sku}
                      className={`border-b hover:bg-gray-50 ${
                        selected.has(product.sku) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(product.sku)}
                          onChange={() => toggleSelect(product.sku)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {product.sku}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{product.name}</div>
                        {product.leadTimeDays != null && product.leadTimeDays > 0 && (
                          <span className="text-xs text-gray-400">
                            Leveringstid: {product.leadTimeDays} dage
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatPrice(product.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {product.listPrice ? formatPrice(product.listPrice) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">
                        {product.unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {product.isAvailable ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <Check className="w-3 h-3 mr-1" />
                            På lager
                            {product.stockQuantity != null && ` (${product.stockQuantity})`}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-50 text-red-700">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Ikke på lager
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRefreshPrice(product.sku)}
                            disabled={refreshingSku === product.sku}
                            title="Opdater pris"
                          >
                            {refreshingSku === product.sku ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCompare(product.name)}
                            disabled={comparingProduct === product.name}
                            title="Sammenlign priser"
                          >
                            {comparingProduct === product.name ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ArrowUpDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Price comparisons */}
          {Object.entries(comparisons).length > 0 && (
            <div className="px-6 py-4 border-t bg-gray-50">
              <h4 className="font-semibold mb-3">Prissammenligninger</h4>
              {Object.entries(comparisons).map(([productName, comps]) => (
                <div key={productName} className="mb-4 last:mb-0">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    &quot;{productName}&quot;
                  </p>
                  {comps.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      Ingen andre leverandører har dette produkt
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {comps.map((comp, idx) => (
                        <div
                          key={comp.supplierId}
                          className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                            idx === 0 ? 'bg-green-50 border border-green-200' : 'bg-white border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {idx === 0 && (
                              <Badge variant="default" className="bg-green-600 text-xs">
                                Bedste pris
                              </Badge>
                            )}
                            <span className="font-medium">{comp.supplierName}</span>
                            {comp.supplierCode && (
                              <span className="text-gray-400">({comp.supplierCode})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`font-medium ${idx === 0 ? 'text-green-700' : ''}`}>
                              {formatPrice(comp.price.costPrice)}
                            </span>
                            <Badge variant={comp.price.isAvailable ? 'default' : 'secondary'}>
                              {comp.price.isAvailable ? 'På lager' : 'Ikke på lager'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
