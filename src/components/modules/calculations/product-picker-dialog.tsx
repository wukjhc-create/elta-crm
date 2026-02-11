'use client'

import { useState } from 'react'
import { Search, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils/format'

interface Product {
  id: string
  name: string
  sku: string | null
  list_price: number
}

interface ProductPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onSelect: (productId: string) => void
}

export default function ProductPickerDialog({
  open,
  onOpenChange,
  products,
  onSelect,
}: ProductPickerDialogProps) {
  const [search, setSearch] = useState('')

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku?.toLowerCase().includes(search.toLowerCase())
  )


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vælg produkt</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg efter produkter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[300px]">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>Ingen produkter fundet</p>
            </div>
          ) : (
            filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => onSelect(product.id)}
                className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 transition-colors flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">{product.name}</div>
                  {product.sku && (
                    <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatCurrency(product.list_price)}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
