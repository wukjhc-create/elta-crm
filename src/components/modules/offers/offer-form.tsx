'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { createOfferSchema, type CreateOfferInput } from '@/lib/validations/offers'
import {
  createOffer,
  updateOffer,
  getCustomersForSelect,
  getLeadsForSelect,
} from '@/lib/actions/offers'
import type { Offer } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'

interface CalculatorData {
  systemSize?: number
  panelCount?: number
  totalPrice?: number
}

interface OfferFormProps {
  offer?: Offer
  companySettings?: CompanySettings | null
  calculatorData?: CalculatorData | null
  onClose: () => void
  onSuccess?: (offer: Offer) => void
}

export function OfferForm({ offer, companySettings, calculatorData, onClose, onSuccess }: OfferFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [customers, setCustomers] = useState<
    { id: string; company_name: string; customer_number: string }[]
  >([])
  const [leads, setLeads] = useState<{ id: string; company_name: string }[]>([])

  const isEditing = !!offer

  // Calculate default validity date from company settings
  const getDefaultValidUntil = () => {
    if (companySettings?.default_offer_validity_days) {
      const date = new Date()
      date.setDate(date.getDate() + companySettings.default_offer_validity_days)
      return date.toISOString().split('T')[0]
    }
    return undefined
  }

  // Generate default title from calculator data
  const getDefaultTitle = () => {
    if (calculatorData?.systemSize) {
      return `Solcelleanlæg ${calculatorData.systemSize} kWp`
    }
    return undefined
  }

  // Generate default description from calculator data
  const getDefaultDescription = () => {
    if (calculatorData) {
      const parts: string[] = []
      if (calculatorData.systemSize) parts.push(`${calculatorData.systemSize} kWp solcelleanlæg`)
      if (calculatorData.panelCount) parts.push(`${calculatorData.panelCount} paneler`)
      return parts.length > 0 ? parts.join(' med ') : undefined
    }
    return undefined
  }

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateOfferInput>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: offer
      ? {
          title: offer.title,
          description: offer.description,
          customer_id: offer.customer_id,
          lead_id: offer.lead_id,
          discount_percentage: offer.discount_percentage,
          tax_percentage: offer.tax_percentage,
          valid_until: offer.valid_until,
          terms_and_conditions: offer.terms_and_conditions,
          notes: offer.notes,
        }
      : {
          title: getDefaultTitle(),
          description: getDefaultDescription(),
          discount_percentage: 0,
          tax_percentage: companySettings?.default_tax_percentage ?? 25,
          valid_until: getDefaultValidUntil(),
          terms_and_conditions: companySettings?.default_terms_and_conditions || undefined,
        },
  })

  const customerId = watch('customer_id')

  useEffect(() => {
    async function loadData() {
      const [customersResult, leadsResult] = await Promise.all([
        getCustomersForSelect(),
        getLeadsForSelect(),
      ])

      if (customersResult.success && customersResult.data) {
        setCustomers(customersResult.data)
      }
      if (leadsResult.success && leadsResult.data) {
        setLeads(leadsResult.data)
      }
    }
    loadData()
  }, [])

  const onSubmit = async (data: CreateOfferInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      if (offer?.id) {
        formData.append('id', offer.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, String(value))
        }
      })

      const result = isEditing
        ? await updateOffer(formData)
        : await createOffer(formData)

      if (!result.success) {
        setError(result.error || 'Der opstod en fejl')
        return
      }

      if (result.data) {
        onSuccess?.(result.data)
      }
      onClose()
      router.refresh()

      // If creating new offer, navigate to detail page
      if (!isEditing && result.data) {
        router.push(`/dashboard/offers/${result.data.id}`)
      }
    } catch (err) {
      setError('Der opstod en uventet fejl')
      console.error('Form submit error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold">
            {isEditing ? 'Rediger Tilbud' : 'Opret Nyt Tilbud'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
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
          {/* Title */}
          <div className="space-y-1">
            <label htmlFor="title" className="text-sm font-medium">
              Titel *
            </label>
            <input
              {...register('title')}
              id="title"
              type="text"
              placeholder="f.eks. Solcelleanlæg 10 kWp"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title.message}</p>
            )}
          </div>

          {/* Customer / Lead */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="customer_id" className="text-sm font-medium">
                Kunde
              </label>
              <select
                {...register('customer_id')}
                id="customer_id"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                <option value="">Vælg kunde...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company_name} ({customer.customer_number})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="lead_id" className="text-sm font-medium">
                Lead
              </label>
              <select
                {...register('lead_id')}
                id="lead_id"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading || !!customerId}
              >
                <option value="">Vælg lead...</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.company_name}
                  </option>
                ))}
              </select>
              {customerId && (
                <p className="text-xs text-gray-500">
                  Lead deaktiveret når kunde er valgt
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="description" className="text-sm font-medium">
              Beskrivelse
            </label>
            <textarea
              {...register('description')}
              id="description"
              rows={3}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Financial settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="space-y-1">
              <label htmlFor="tax_percentage" className="text-sm font-medium">
                Moms (%)
              </label>
              <input
                {...register('tax_percentage', { valueAsNumber: true })}
                id="tax_percentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="valid_until" className="text-sm font-medium">
                Gyldig til
              </label>
              <input
                {...register('valid_until')}
                id="valid_until"
                type="date"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Terms */}
          <div className="space-y-1">
            <label htmlFor="terms_and_conditions" className="text-sm font-medium">
              Betingelser
            </label>
            <textarea
              {...register('terms_and_conditions')}
              id="terms_and_conditions"
              rows={3}
              placeholder="Betalingsbetingelser, leveringstid, garanti mv."
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Interne noter
            </label>
            <textarea
              {...register('notes')}
              id="notes"
              rows={2}
              placeholder="Noter til internt brug (vises ikke på tilbud)"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

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
                  : 'Opret tilbud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
