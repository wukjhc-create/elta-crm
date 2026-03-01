'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Search, Loader2, Package } from 'lucide-react'
import {
  createLineItemSchema,
  type CreateLineItemInput,
} from '@/lib/validations/offers'
import { createLineItem, updateLineItem, searchSupplierProductsForOffer } from '@/lib/actions/offers'
import { OFFER_UNITS, type OfferLineItem } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'
import { formatCurrency } from '@/lib/utils/format'

interface SupplierSearchResult {
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
  image_url: string | null
}

interface LineItemFormProps {
  offerId: string
  customerId?: string | null
  lineItem?: OfferLineItem
  nextPosition: number
  companySettings?: CompanySettings | null
  onClose: () => void
  onSuccess?: () => void
}

export function LineItemForm({
  offerId,
  customerId,
  lineItem,
  nextPosition,
  companySettings,
  onClose,
  onSuccess,
}: LineItemFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Supplier search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SupplierSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<SupplierSearchResult | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isEditing = !!lineItem

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateLineItemInput>({
    resolver: zodResolver(createLineItemSchema),
    defaultValues: lineItem
      ? {
          offer_id: offerId,
          position: lineItem.position,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unit: lineItem.unit,
          unit_price: lineItem.unit_price,
          discount_percentage: lineItem.discount_percentage,
        }
      : {
          offer_id: offerId,
          position: nextPosition,
          quantity: 1,
          unit: 'stk',
          discount_percentage: 0,
        },
  })

  const quantity = watch('quantity') || 0
  const unitPrice = watch('unit_price') || 0
  const discountPercentage = watch('discount_percentage') || 0

  const calculatedTotal = quantity * unitPrice * (1 - discountPercentage / 100)

  const currency = companySettings?.default_currency || 'DKK'

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true)
      const result = await searchSupplierProductsForOffer(query, {
        customerId: customerId || undefined,
        limit: 10,
      })
      if (result.success && result.data) {
        setSearchResults(result.data)
      }
      setIsSearching(false)
    }, 400)
  }

  const handleSelectProduct = (product: SupplierSearchResult) => {
    setSelectedProduct(product)
    setValue('description', product.product_name)
    setValue('unit_price', product.estimated_sale_price)
    setValue('unit', product.unit || 'stk')
    setSearchQuery('')
    setSearchResults([])
  }

  const onSubmit = async (data: CreateLineItemInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      formData.append('offer_id', offerId)

      if (lineItem?.id) {
        formData.append('id', lineItem.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value))
        }
      })

      const result = isEditing
        ? await updateLineItem(formData)
        : await createLineItem(formData)

      if (!result.success) {
        setError(result.error || 'Der opstod en fejl')
        return
      }

      onSuccess?.()
      onClose()
      router.refresh()
    } catch (err) {
      setError('Der opstod en uventet fejl')
      console.error('Form submit error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="line-item-form-title" className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="line-item-form-title" className="text-lg font-semibold">
            {isEditing ? 'Rediger Linje' : 'Tilføj Linje'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Supplier product search (only shown when creating, not editing) */}
        {!isEditing && (
          <div className="px-4 pt-4">
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Søg leverandørprodukt
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Varenummer eller produktnavn (f.eks. 1234567)..."
                className="w-full pl-10 pr-10 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />
              )}
            </div>

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="mt-1 max-h-[240px] overflow-y-auto border rounded-md bg-white shadow-lg divide-y">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProduct(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors"
                  >
                    {/* Product image or placeholder */}
                    <div className="w-10 h-10 shrink-0 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <Package className="w-5 h-5 text-gray-300" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          p.supplier_code === 'AO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.supplier_code}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{p.supplier_sku}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{p.product_name}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-gray-400">Netto {formatCurrency(p.cost_price, currency, 2)}</div>
                      <div className="text-sm font-semibold text-green-700">{formatCurrency(p.estimated_sale_price, currency, 2)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <p className="mt-1 text-xs text-gray-400 text-center py-2">
                Ingen produkter fundet
              </p>
            )}

            {/* Selected product info */}
            {selectedProduct && (
              <div className="mt-2 flex items-center gap-3 p-2 bg-green-50 border border-green-200 rounded-md">
                <div className="w-8 h-8 shrink-0 rounded bg-white flex items-center justify-center overflow-hidden border">
                  {selectedProduct.image_url ? (
                    <img src={selectedProduct.image_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Package className="w-4 h-4 text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-green-800 truncate">
                    {selectedProduct.supplier_code} {selectedProduct.supplier_sku} — {selectedProduct.product_name}
                  </p>
                  <p className="text-[10px] text-green-600">
                    Netto: {formatCurrency(selectedProduct.cost_price, currency, 2)} → Salg: {formatCurrency(selectedProduct.estimated_sale_price, currency, 2)} ({selectedProduct.margin_percentage}% avance)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="p-0.5 text-green-500 hover:text-green-700"
                  aria-label="Fjern valgt produkt"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="border-b mt-3" />
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="description" className="text-sm font-medium">
              Beskrivelse *
            </label>
            <textarea
              {...register('description')}
              id="description"
              rows={2}
              placeholder="f.eks. Solcellepaneler 400W"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          {/* Quantity and Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="quantity" className="text-sm font-medium">
                Antal *
              </label>
              <input
                {...register('quantity', { valueAsNumber: true })}
                id="quantity"
                type="number"
                min="0.01"
                step="0.01"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
              {errors.quantity && (
                <p className="text-sm text-red-600">{errors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="unit" className="text-sm font-medium">
                Enhed
              </label>
              <select
                {...register('unit')}
                id="unit"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                {OFFER_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Unit price and Discount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="unit_price" className="text-sm font-medium">
                Enhedspris (DKK) *
              </label>
              <input
                {...register('unit_price', { valueAsNumber: true })}
                id="unit_price"
                type="number"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
              {errors.unit_price && (
                <p className="text-sm text-red-600">{errors.unit_price.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="discount_percentage" className="text-sm font-medium">
                Rabat (%)
              </label>
              <input
                {...register('discount_percentage', { valueAsNumber: true })}
                id="discount_percentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Calculated total */}
          <div className="p-3 bg-gray-50 rounded-md">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Linje total:</span>
              <span className="text-lg font-semibold">
                {formatCurrency(calculatedTotal, currency, 2)}
              </span>
            </div>
          </div>

          {/* Hidden position */}
          <input type="hidden" {...register('position', { valueAsNumber: true })} />
          <input type="hidden" {...register('offer_id')} />

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading
                ? 'Gemmer...'
                : isEditing
                  ? 'Gem ændringer'
                  : 'Tilføj linje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
