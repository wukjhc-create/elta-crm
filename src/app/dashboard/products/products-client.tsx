'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Search,
  Package,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/shared/pagination'
import { useToast } from '@/components/ui/toast'
import { deleteProduct } from '@/lib/actions/products'
import type { ProductWithCategory, ProductCategory } from '@/types/products.types'
import type { PaginatedResponse } from '@/types/common.types'
import ProductForm from '@/components/modules/products/product-form'
import { formatCurrency } from '@/lib/utils/format'
import { storedCostText } from '@/lib/products/stored-cost-text'

interface ProductsClientProps {
  initialProducts: PaginatedResponse<ProductWithCategory> | null
  loadError?: string | null
  categories: ProductCategory[]
  categoriesError?: string | null
  initialFilters: {
    search: string
    category_id: string
  }
  /** D47: products.view.cost_prices */
  canSeeCost?: boolean
}

export default function ProductsClient({
  initialProducts,
  loadError = null,
  categories,
  categoriesError = null,
  initialFilters,
  canSeeCost = false,
}: ProductsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(initialFilters.search)
  const [categoryId, setCategoryId] = useState(initialFilters.category_id)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductWithCategory | null>(null)

  const products = initialProducts?.data || []
  const total = initialProducts?.total || 0
  const page = initialProducts?.page || 1
  const totalPages = initialProducts?.totalPages || 1
  const hasFilter = Boolean(search || categoryId)

  const updateFilters = (newFilters: { search?: string; category_id?: string; page?: number }) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (newFilters.search !== undefined) {
        if (newFilters.search) {
          params.set('search', newFilters.search)
        } else {
          params.delete('search')
        }
        params.delete('page') // Reset page when search changes
      }

      if (newFilters.category_id !== undefined) {
        if (newFilters.category_id && newFilters.category_id !== 'all') {
          params.set('category_id', newFilters.category_id)
        } else {
          params.delete('category_id')
        }
        params.delete('page')
      }

      if (newFilters.page !== undefined) {
        if (newFilters.page > 1) {
          params.set('page', newFilters.page.toString())
        } else {
          params.delete('page')
        }
      }

      router.push(`/dashboard/products?${params.toString()}`)
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search })
  }

  const clearFilters = () => {
    setSearch('')
    setCategoryId('')
    updateFilters({ search: '', category_id: 'all' })
  }

  const handleDelete = async (product: ProductWithCategory) => {
    if (!confirm(`Er du sikker på at du vil slette "${product.name}"?`)) {
      return
    }

    const result = await deleteProduct(product.id)
    if (result.success) {
      toast.success('Produkt slettet')
      router.refresh()
    } else {
      toast.error(result.error || 'Kunne ikke slette produkt')
    }
  }


  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold break-words min-w-0" data-testid="product-catalog-title">Produktkatalog</h1>
          <p className="text-gray-500 break-words min-w-0" data-testid="product-count">
            {loadError
              ? 'Antallet kunne ikke hentes. Det tælles ikke som 0 produkter.'
              : `${total} ${total === 1 ? 'produkt' : 'produkter'}`}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="break-words min-w-0" data-testid="product-create">
          <Plus className="w-4 h-4 mr-2" />
          Nyt produkt
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              aria-label="Søg efter produkter"
              placeholder="Søg efter produkter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 break-words min-w-0"
              data-testid="product-search"
            />
          </div>
        </form>
        <Select
          value={categoryId || 'all'}
          onValueChange={(value) => {
            setCategoryId(value)
            updateFilters({ category_id: value })
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]" aria-label="Kategori">
            <SelectValue placeholder="Alle kategorier" className="break-words min-w-0" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><span className="break-words min-w-0" data-testid="product-category-all">Alle kategorier</span></SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <span className="break-words min-w-0" data-testid="product-category-option">{category.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoriesError && (
          <p className="text-sm text-red-700 sm:self-center break-words min-w-0" data-testid="product-categories-load-error">
            {categoriesError}. Det tælles ikke som ingen kategorier.
          </p>
        )}
      </div>

      {/* Products Table */}
      {loadError ? (
        <p className="text-sm text-red-700 py-8 text-center break-words min-w-0" data-testid="products-load-error">
          {loadError}. Det tælles ikke som ingen produkter.
        </p>
      ) : products.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border" data-testid="products-empty">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2 break-words min-w-0" data-testid="products-empty-title">
            {hasFilter ? 'Ingen produkter matcher søgningen' : 'Ingen produkter fundet'}
          </h3>
          <p className="text-gray-500 mb-4 break-words min-w-0" data-testid="products-empty-text">
            {hasFilter
              ? 'Prøv et andet navn, varenummer eller en anden kategori.'
              : 'Kom i gang ved at oprette dit første produkt'}
          </p>
          {hasFilter ? (
            <Button type="button" variant="outline" onClick={clearFilters} className="break-words min-w-0" data-testid="products-clear-filters">
              Ryd søgning
            </Button>
          ) : (
            <Button onClick={() => setShowCreateDialog(true)} className="break-words min-w-0" data-testid="product-create-empty">
              <Plus className="w-4 h-4 mr-2" />
              Opret produkt
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3" data-testid="products-mobile">
            {products.map((product) => (
              <article key={product.id} className="bg-white rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/products/${product.id}`} className="font-medium hover:text-blue-600 break-words">
                      {product.name}
                    </Link>
                    {product.description && (
                      <p className="text-sm text-gray-500 break-words min-w-0" data-testid="product-description-mobile">{product.description}</p>
                    )}
                  </div>
                  <Badge variant={product.is_active ? 'default' : 'secondary'} className="break-words min-w-0" data-testid="product-status-mobile">
                    {product.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 break-all">SKU {product.sku || '-'}</p>
                {product.category && <Badge variant="outline" className="break-words min-w-0" data-testid="product-category-mobile">{product.category.name}</Badge>}
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {canSeeCost && (
                    <div>
                      <dt className="text-xs text-gray-500 break-words min-w-0" data-testid="product-cost-label-mobile">Kostpris</dt>
                      <dd className="break-words" data-testid="product-cost-price">{storedCostText(product.cost_price)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-gray-500 break-words min-w-0" data-testid="product-list-label-mobile">Listepris</dt>
                    <dd className="font-medium break-words min-w-0" data-testid="product-list-price-mobile">{formatCurrency(product.list_price)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3 text-sm">
                  <button type="button" onClick={() => setEditingProduct(product)} className="text-blue-700 break-words min-w-0" data-testid="product-edit-mobile" aria-label={`Rediger ${product.name}`}>Rediger</button>
                  <button type="button" onClick={() => handleDelete(product)} className="text-red-600 break-words min-w-0" data-testid="product-delete-mobile" aria-label={`Slet ${product.name}`}>Slet</button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block bg-white rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="break-words min-w-0" data-testid="product-col-name">Produkt</TableHead>
                <TableHead className="break-words min-w-0" data-testid="product-col-sku">SKU</TableHead>
                <TableHead className="break-words min-w-0" data-testid="product-col-category">Kategori</TableHead>
                {canSeeCost && <TableHead className="text-right break-words min-w-0" data-testid="product-col-cost">Kostpris</TableHead>}
                <TableHead className="text-right break-words min-w-0" data-testid="product-col-list">Listepris</TableHead>
                <TableHead className="break-words min-w-0" data-testid="product-col-status">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="font-medium hover:text-blue-600 break-words"
                    >
                      {product.name}
                    </Link>
                    {product.description && (
                      <p className="text-sm text-gray-500 break-words min-w-0" data-testid="product-description">
                        {product.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 break-all">
                    {product.sku || '-'}
                  </TableCell>
                  <TableCell>
                    {product.category ? (
                      <Badge variant="outline" className="break-words min-w-0" data-testid="product-category">{product.category.name}</Badge>
                    ) : (
                      <span className="text-gray-400 break-words min-w-0" data-testid="product-category-missing">-</span>
                    )}
                  </TableCell>
                  {canSeeCost && (
                  <TableCell className="text-right">
                    <span className="break-words" data-testid="product-cost-price">{storedCostText(product.cost_price)}</span>
                  </TableCell>
                  )}
                  <TableCell className="text-right font-medium break-words min-w-0" data-testid="product-list-price">
                    {formatCurrency(product.list_price)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? 'default' : 'secondary'} className="break-words min-w-0" data-testid="product-status">
                      {product.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Flere handlinger">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingProduct(product)} className="break-words min-w-0" data-testid="product-menu-edit">
                          <Pencil className="w-4 h-4 mr-2" />
                          Rediger
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(product)}
                          className="text-red-600 break-words min-w-0"
                          data-testid="product-menu-delete"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Slet
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t bg-white rounded-lg border">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={25}
                onPageChange={(p) => updateFilters({ page: p })}
                onPageSizeChange={() => {}}
              />
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words min-w-0">Opret nyt produkt</DialogTitle>
          </DialogHeader>
          <ProductForm
            categories={categories}
            categoriesError={categoriesError}
            onSuccess={() => {
              setShowCreateDialog(false)
              router.refresh()
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words min-w-0">Rediger produkt</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              product={editingProduct}
              categories={categories}
              categoriesError={categoriesError}
              onSuccess={() => {
                setEditingProduct(null)
                router.refresh()
              }}
              onCancel={() => setEditingProduct(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
