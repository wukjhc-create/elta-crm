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
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'
import {
  getSupplierProducts,
  getSupplierProductCategories,
} from '@/lib/actions/suppliers'
import type { SupplierProductWithSupplier } from '@/types/suppliers.types'
import { formatDate as formatDateUtil } from '@/lib/utils'

interface SupplierProductsTableProps {
  supplierId: string
  supplierName?: string
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
  const pageSize = 25

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [supplierId, page, category])

  useEffect(() => {
    // Reset to page 1 when search changes
    setPage(1)
  }, [search])

  useEffect(() => {
    // Debounce search
    const timeout = setTimeout(() => {
      loadProducts()
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const loadProducts = async () => {
    setLoading(true)
    const result = await getSupplierProducts({
      supplier_id: supplierId,
      search: search || undefined,
      category: category || undefined,
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

  const formatPrice = (price: number | null) => {
    if (price === null) return '-'
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
    }).format(price)
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return formatDateUtil(date)
  }

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
          {category && <> i "{category}"</>}
          {search && <> matchende "{search}"</>}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Varenummer</TableHead>
              <TableHead>Navn</TableHead>
              <TableHead className="w-[120px]">Kategori</TableHead>
              <TableHead className="w-[100px] text-right">Kostpris</TableHead>
              <TableHead className="w-[100px] text-right">Listepris</TableHead>
              <TableHead className="w-[100px] text-right">Salgspris</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[100px]">Opdateret</TableHead>
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
                    {formatPrice(product.cost_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPrice(product.list_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-blue-600">
                    {formatPrice(product.effective_sale_price)}
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
