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

interface ProductsClientProps {
  initialProducts: PaginatedResponse<ProductWithCategory> | null
  categories: ProductCategory[]
  initialFilters: {
    search: string
    category_id: string
  }
}

export default function ProductsClient({
  initialProducts,
  categories,
  initialFilters,
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
    }).format(price)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produktkatalog</h1>
          <p className="text-gray-500">
            {total} {total === 1 ? 'produkt' : 'produkter'}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nyt produkt
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Søg efter produkter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
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
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle kategorier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kategorier</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Products Table */}
      {products.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Ingen produkter fundet
          </h3>
          <p className="text-gray-500 mb-4">
            {search || categoryId
              ? 'Prøv at ændre dine søgekriterier'
              : 'Kom i gang ved at oprette dit første produkt'}
          </p>
          {!search && !categoryId && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Opret produkt
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Kostpris</TableHead>
                <TableHead className="text-right">Listepris</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="font-medium hover:text-blue-600"
                    >
                      {product.name}
                    </Link>
                    {product.description && (
                      <p className="text-sm text-gray-500 line-clamp-1">
                        {product.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {product.sku || '-'}
                  </TableCell>
                  <TableCell>
                    {product.category ? (
                      <Badge variant="outline">{product.category.name}</Badge>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {product.cost_price ? formatPrice(product.cost_price) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPrice(product.list_price)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? 'default' : 'secondary'}>
                      {product.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingProduct(product)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Rediger
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(product)}
                          className="text-red-600"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t">
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
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Opret nyt produkt</DialogTitle>
          </DialogHeader>
          <ProductForm
            categories={categories}
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
            <DialogTitle>Rediger produkt</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              product={editingProduct}
              categories={categories}
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
