'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Search,
  Loader2,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
} from 'lucide-react'
import {
  getSupplierProducts,
  getSupplierProductCategories,
} from '@/lib/actions/suppliers'
import type { SupplierProductWithSupplier, SupplierProductFilters } from '@/types/suppliers.types'
import { formatDate as formatDateUtil } from '@/lib/utils'
import { storedCostText } from '@/lib/products/stored-cost-text'

type SortColumn = SupplierProductFilters['sortBy']

interface SupplierProductsTableProps {
  supplierId: string
  supplierName?: string
}

function SortIcon({ column, currentSort, currentOrder }: { column: string; currentSort?: string; currentOrder?: 'asc' | 'desc' }) {
  if (currentSort !== column) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
  return currentOrder === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-primary" />
    : <ChevronDown className="w-3.5 h-3.5 text-primary" />
}

export function SupplierProductsTable({
  supplierId,
  supplierName,
}: SupplierProductsTableProps) {
  const toast = useToast()
  const [products, setProducts] = useState<SupplierProductWithSupplier[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState<SortColumn>('supplier_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shownKey, setShownKey] = useState<string | null>(null)
  const loadedKey = useRef<string | null>(null)
  const seq = useRef(0)
  const pageSize = 25
  const queryKey = `${supplierId}|${search}|${category}|${page}|${sortBy}|${sortOrder}`
  const showingThisQuery = shownKey === queryKey && products.length > 0

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [supplierId, page, category, sortBy, sortOrder])

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadProducts()
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const loadProducts = async () => {
    const my = ++seq.current
    const key = `${supplierId}|${search}|${category}|${page}|${sortBy}|${sortOrder}`
    setLoading(true)
    const result = await getSupplierProducts({
      supplier_id: supplierId,
      search: search || undefined,
      category: category || undefined,
      sortBy,
      sortOrder,
      page,
      pageSize,
    })
    if (my !== seq.current) return
    if (result.success && result.data) {
      setLoadError(null)
      setProducts(result.data.data)
      setTotalPages(result.data.totalPages)
      setTotal(result.data.total)
      loadedKey.current = key
      setShownKey(key)
    } else {
      const message = result.success ? 'Kunne ikke hente produkter' : (result.error || 'Kunne ikke hente produkter')
      if (message.includes('Manglende tilladelse') || message.includes('Ikke logget ind') || loadedKey.current !== key) {
        setProducts([])
        setTotalPages(1)
        setTotal(0)
        loadedKey.current = null
        setShownKey(null)
      }
      setLoadError(message)
    }
    setLoading(false)
  }

  const loadCategories = async () => {
    const result = await getSupplierProductCategories(supplierId)
    if (result.success && result.data) {
      setCategories(result.data)
    } else if (!result.success) {
      toast.error('Kunne ikke hente kategorier')
    }
  }


  const sortableHeaderClass = 'cursor-pointer select-none hover:bg-gray-100/50 transition-colors'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg varenummer, navn, EAN..."
            aria-label="Søg leverandørprodukter"
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Alle kategorier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Alle kategorier</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {loadError && !showingThisQuery ? (
            'Antallet kunne ikke hentes. Det tælles ikke som 0 produkter.'
          ) : (
            <>
              {total.toLocaleString('da-DK')} produkter
              {category && <> i &quot;{category}&quot;</>}
              {search && <> matchende &quot;{search}&quot;</>}
            </>
          )}
        </span>
      </div>

      {loadError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          {loadError}. Det tælles ikke som ingen produkter.
        </p>
      )}

      {loading && !showingThisQuery ? (
        <div className="h-32 flex items-center justify-center bg-white rounded-lg border">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : loadError && !showingThisQuery ? null : products.length === 0 ? (
        <div className="h-32 flex flex-col items-center justify-center text-center text-gray-500 bg-white rounded-lg border">
          <Package className="w-12 h-12 mb-2 text-gray-300" />
          <p className="break-words min-w-0" data-testid="supplier-products-empty-title">Ingen produkter fundet</p>
          {search && (
            <p className="text-sm break-words min-w-0" data-testid="supplier-products-empty-hint">Prøv at ændre din søgning</p>
          )}
        </div>
      ) : (
        <>
          {/* Kost vises fordi getSupplierProducts allerede kraever products.view.cost_prices. */}
          <div className="md:hidden space-y-3" data-testid="supplier-products-mobile">
            {products.map((product) => (
              <article key={product.id} className="rounded-lg border bg-white p-3 space-y-2 text-sm break-words min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-gray-500 break-all min-w-0" data-testid="supplier-product-mobile-sku">{product.supplier_sku}</p>
                    <p className="font-medium break-words">{product.supplier_name}</p>
                    {product.manufacturer && (
                      <p className="text-xs text-gray-500 break-words min-w-0">{product.manufacturer}</p>
                    )}
                  </div>
                  <Badge variant={product.is_available ? 'default' : 'secondary'} className="break-words min-w-0 max-w-full" data-testid="supplier-product-mobile-status">
                    {product.is_available ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
                {product.category && (
                  <Badge variant="secondary" className="text-xs break-words min-w-0 max-w-full" data-testid="supplier-product-mobile-category">{product.category}</Badge>
                )}
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-500">Kostpris</dt>
                    <dd className="font-mono break-words">{storedCostText(product.cost_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Listepris</dt>
                    <dd className="font-mono break-words">{storedCostText(product.list_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Salgspris</dt>
                    <dd className="font-mono break-words text-blue-600">{storedCostText(product.effective_sale_price)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-gray-500 break-words min-w-0" data-testid="supplier-product-mobile-updated">
                  Opdateret {(product.last_synced_at || product.updated_at) ? formatDateUtil(product.last_synced_at || product.updated_at) : '-'}
                </p>
              </article>
            ))}
          </div>

          <div className="hidden md:block bg-white rounded-lg border overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-gray-50">
                <TableRow>
                  <TableHead className={`w-[150px] ${sortableHeaderClass}`} onClick={() => handleSort('supplier_sku')}>
                    <div className="flex items-center gap-1">
                      Varenummer
                      <SortIcon column="supplier_sku" currentSort={sortBy} currentOrder={sortOrder} />
                    </div>
                  </TableHead>
                  <TableHead className={sortableHeaderClass} onClick={() => handleSort('supplier_name')}>
                    <div className="flex items-center gap-1">
                      Navn
                      <SortIcon column="supplier_name" currentSort={sortBy} currentOrder={sortOrder} />
                    </div>
                  </TableHead>
                  <TableHead className={`w-[120px] ${sortableHeaderClass}`} onClick={() => handleSort('category')}>
                    <div className="flex items-center gap-1">
                      Kategori
                      <SortIcon column="category" currentSort={sortBy} currentOrder={sortOrder} />
                    </div>
                  </TableHead>
                  <TableHead className={`w-[100px] text-right ${sortableHeaderClass}`} onClick={() => handleSort('cost_price')}>
                    <div className="flex items-center gap-1 justify-end">
                      Kostpris
                      <SortIcon column="cost_price" currentSort={sortBy} currentOrder={sortOrder} />
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px] text-right">Listepris</TableHead>
                  <TableHead className="w-[100px] text-right">Salgspris</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className={`w-[100px] ${sortableHeaderClass}`} onClick={() => handleSort('updated_at')}>
                    <div className="flex items-center gap-1">
                      Opdateret
                      <SortIcon column="updated_at" currentSort={sortBy} currentOrder={sortOrder} />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-sm break-all min-w-0" data-testid="supplier-product-desktop-sku">
                      {product.supplier_sku}
                    </TableCell>
                    <TableCell className="break-words min-w-0">
                      <div>
                        <p className="font-medium break-words min-w-0">{product.supplier_name}</p>
                        {product.manufacturer && (
                          <p className="text-xs text-gray-500 break-words min-w-0">{product.manufacturer}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.category && (
                        <Badge variant="secondary" className="text-xs break-words min-w-0 max-w-full" data-testid="supplier-product-desktop-category">
                          {product.category}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {storedCostText(product.cost_price)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {storedCostText(product.list_price)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-blue-600">
                      {storedCostText(product.effective_sale_price)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.is_available ? 'default' : 'secondary'} className="break-words min-w-0 max-w-full" data-testid="supplier-product-desktop-status">
                        {product.is_available ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 break-words min-w-0" data-testid="supplier-product-desktop-updated">
                      {(product.last_synced_at || product.updated_at) ? formatDateUtil(product.last_synced_at || product.updated_at) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            Side {page} af {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Forrige
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Næste
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
