'use client'

import { useState, useEffect } from 'react'
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
import { formatCurrency } from '@/lib/utils/format'

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
  const pageSize = 25

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
    if (result.success && result.data) {
      setProducts(result.data.data)
      setTotalPages(result.data.totalPages)
      setTotal(result.data.total)
    }
    setLoading(false)
  }

  const loadCategories = async () => {
    const result = await getSupplierProductCategories(supplierId)
    if (result.success && result.data) {
      setCategories(result.data)
    }
  }


  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return formatDateUtil(date)
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
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px]">
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
          {total.toLocaleString('da-DK')} produkter
          {category && <> i &quot;{category}&quot;</>}
          {search && <> matchende &quot;{search}&quot;</>}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden overflow-x-auto">
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Ingen produkter fundet</p>
                  {search && (
                    <p className="text-sm">Prøv at ændre din søgning</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">
                    {product.supplier_sku}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium line-clamp-1">{product.supplier_name}</p>
                      {product.manufacturer && (
                        <p className="text-xs text-gray-500">{product.manufacturer}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {product.category && (
                      <Badge variant="secondary" className="text-xs">
                        {product.category}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {product.cost_price !== null ? formatCurrency(product.cost_price) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {product.list_price !== null ? formatCurrency(product.list_price) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-blue-600">
                    {product.effective_sale_price !== null ? formatCurrency(product.effective_sale_price) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_available ? 'default' : 'secondary'}>
                      {product.is_available ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {formatDate(product.last_synced_at || product.updated_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
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
