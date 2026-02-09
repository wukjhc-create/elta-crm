'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import {
  createLineItemSchema,
  type CreateLineItemInput,
} from '@/lib/validations/offers'
import { createLineItem, updateLineItem } from '@/lib/actions/offers'
import { OFFER_UNITS, type OfferLineItem } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'

interface LineItemFormProps {
  offerId: string
  lineItem?: OfferLineItem
  nextPosition: number
  companySettings?: CompanySettings | null
  onClose: () => void
  onSuccess?: () => void
}

export function LineItemForm({
  offerId,
  lineItem,
  nextPosition,
  companySettings,
  onClose,
  onSuccess,
}: LineItemFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isEditing = !!lineItem

  const {
    register,
    handleSubmit,
    watch,
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
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
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
                {formatCurrency(calculatedTotal)}
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
