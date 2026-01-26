'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { deleteProduct } from '@/lib/actions/products'
import ProductForm from '@/components/modules/products/product-form'
import type { ProductWithCategory, ProductCategory } from '@/types/products.types'

interface ProductDetailClientProps {
  product: ProductWithCategory
  categories: ProductCategory[]
}

export default function ProductDetailClient({
  product,
  categories,
}: ProductDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [showEditDialog, setShowEditDialog] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Er du sikker på at du vil slette "${product.name}"?`)) {
      return
    }

    const result = await deleteProduct(product.id)
    if (result.success) {
      toast.success('Produkt slettet')
      router.push('/dashboard/products')
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

  const margin =
    product.cost_price && product.list_price
      ? ((product.list_price - product.cost_price) / product.cost_price) * 100
      : null

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowEditDialog(true)}>
          <Pencil className="w-4 h-4 mr-2" />
          Rediger
        </Button>
        <Button variant="outline" onClick={handleDelete} className="text-red-600">
          <Trash2 className="w-4 h-4 mr-2" />
          Slet
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Produktinformation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Status</span>
              <Badge variant={product.is_active ? 'default' : 'secondary'}>
                {product.is_active ? 'Aktiv' : 'Inaktiv'}
              </Badge>
            </div>

            {product.category && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Kategori</span>
                <Badge variant="outline">{product.category.name}</Badge>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-gray-500">Enhed</span>
              <span>{product.unit}</span>
            </div>

            {product.description && (
              <div>
                <span className="text-gray-500 block mb-1">Beskrivelse</span>
                <p className="text-sm">{product.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Priser</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Listepris</span>
              <span className="text-xl font-bold">
                {formatPrice(product.list_price)}
              </span>
            </div>

            {product.cost_price && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Kostpris</span>
                <span>{formatPrice(product.cost_price)}</span>
              </div>
            )}

            {margin !== null && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Avance</span>
                <span className={margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {margin.toFixed(1)}%
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Specifications */}
        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Specifikationer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-500 capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span>{String(value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rediger produkt</DialogTitle>
          </DialogHeader>
          <ProductForm
            product={product}
            categories={categories}
            onSuccess={() => {
              setShowEditDialog(false)
              router.refresh()
            }}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
