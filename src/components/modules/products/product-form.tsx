'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { createProduct, updateProduct } from '@/lib/actions/products'
import { PRODUCT_UNITS } from '@/types/products.types'
import type { ProductWithCategory, ProductCategory } from '@/types/products.types'

interface ProductFormProps {
  product?: ProductWithCategory
  categories: ProductCategory[]
  onSuccess: () => void
  onCancel: () => void
}

export default function ProductForm({
  product,
  categories,
  onSuccess,
  onCancel,
}: ProductFormProps) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [isActive, setIsActive] = useState(product?.is_active ?? true)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('is_active', isActive.toString())

    startTransition(async () => {
      const result = product
        ? await updateProduct(formData)
        : await createProduct(formData)

      if (result.success) {
        toast.success(product ? 'Produkt opdateret' : 'Produkt oprettet')
        onSuccess()
      } else {
        toast.error(result.error || 'Der opstod en fejl')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="name">Produktnavn *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={product?.name}
            required
            placeholder="F.eks. JA Solar 400W Panel"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            name="sku"
            defaultValue={product?.sku || ''}
            placeholder="F.eks. JA400-MONO"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Beskrivelse</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={product?.description || ''}
          placeholder="Produktbeskrivelse..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="category_id">Kategori</Label>
          <Select name="category_id" defaultValue={product?.category_id || ''}>
            <SelectTrigger>
              <SelectValue placeholder="Vælg kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="unit">Enhed</Label>
          <Select name="unit" defaultValue={product?.unit || 'stk'}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_UNITS.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cost_price">Kostpris (DKK)</Label>
          <Input
            id="cost_price"
            name="cost_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.cost_price || ''}
            placeholder="0,00"
          />
        </div>

        <div>
          <Label htmlFor="list_price">Listepris (DKK) *</Label>
          <Input
            id="list_price"
            name="list_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.list_price || ''}
            required
            placeholder="0,00"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
        <Label htmlFor="is_active">Aktiv</Label>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Gemmer...' : product ? 'Opdater' : 'Opret'}
        </Button>
      </div>
    </form>
  )
}
