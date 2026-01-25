'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Copy } from 'lucide-react'
import { createCustomerSchema, type CreateCustomerInput } from '@/lib/validations/customers'
import { createCustomer, updateCustomer } from '@/lib/actions/customers'
import type { Customer } from '@/types/customers.types'

interface CustomerFormProps {
  customer?: Customer
  onClose: () => void
  onSuccess?: () => void
}

export function CustomerForm({ customer, onClose, onSuccess }: CustomerFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isEditing = !!customer

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: customer
      ? {
          company_name: customer.company_name,
          contact_person: customer.contact_person,
          email: customer.email,
          phone: customer.phone,
          mobile: customer.mobile,
          website: customer.website,
          vat_number: customer.vat_number,
          billing_address: customer.billing_address,
          billing_city: customer.billing_city,
          billing_postal_code: customer.billing_postal_code,
          billing_country: customer.billing_country || 'Danmark',
          shipping_address: customer.shipping_address,
          shipping_city: customer.shipping_city,
          shipping_postal_code: customer.shipping_postal_code,
          shipping_country: customer.shipping_country || 'Danmark',
          notes: customer.notes,
          tags: customer.tags,
          is_active: customer.is_active,
        }
      : {
          billing_country: 'Danmark',
          shipping_country: 'Danmark',
          tags: [],
          is_active: true,
        },
  })

  const copyBillingToShipping = () => {
    const values = getValues()
    setValue('shipping_address', values.billing_address)
    setValue('shipping_city', values.billing_city)
    setValue('shipping_postal_code', values.billing_postal_code)
    setValue('shipping_country', values.billing_country)
  }

  const onSubmit = async (data: CreateCustomerInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      if (customer?.id) {
        formData.append('id', customer.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value))
          } else if (typeof value === 'boolean') {
            formData.append(key, String(value))
          } else {
            formData.append(key, String(value))
          }
        }
      })

      const result = isEditing
        ? await updateCustomer(formData)
        : await createCustomer(formData)

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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold">
            {isEditing ? 'Rediger Kunde' : 'Opret Ny Kunde'}
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

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-6">
          {/* Basic info section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Grundlæggende oplysninger</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="company_name" className="text-sm font-medium">
                  Firmanavn *
                </label>
                <input
                  {...register('company_name')}
                  id="company_name"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
                {errors.company_name && (
                  <p className="text-sm text-red-600">{errors.company_name.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="vat_number" className="text-sm font-medium">
                  CVR-nummer
                </label>
                <input
                  {...register('vat_number')}
                  id="vat_number"
                  type="text"
                  placeholder="DK12345678"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="contact_person" className="text-sm font-medium">
                  Kontaktperson *
                </label>
                <input
                  {...register('contact_person')}
                  id="contact_person"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
                {errors.contact_person && (
                  <p className="text-sm text-red-600">{errors.contact_person.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium">
                  E-mail *
                </label>
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="phone" className="text-sm font-medium">
                  Telefon
                </label>
                <input
                  {...register('phone')}
                  id="phone"
                  type="tel"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="mobile" className="text-sm font-medium">
                  Mobil
                </label>
                <input
                  {...register('mobile')}
                  id="mobile"
                  type="tel"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label htmlFor="website" className="text-sm font-medium">
                  Hjemmeside
                </label>
                <input
                  {...register('website')}
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Billing address section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Faktureringsadresse</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label htmlFor="billing_address" className="text-sm font-medium">
                  Adresse
                </label>
                <input
                  {...register('billing_address')}
                  id="billing_address"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="billing_postal_code" className="text-sm font-medium">
                  Postnummer
                </label>
                <input
                  {...register('billing_postal_code')}
                  id="billing_postal_code"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="billing_city" className="text-sm font-medium">
                  By
                </label>
                <input
                  {...register('billing_city')}
                  id="billing_city"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="billing_country" className="text-sm font-medium">
                  Land
                </label>
                <input
                  {...register('billing_country')}
                  id="billing_country"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Shipping address section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Leveringsadresse</h3>
              <button
                type="button"
                onClick={copyBillingToShipping}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Copy className="w-4 h-4" />
                Kopiér fra faktureringsadresse
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label htmlFor="shipping_address" className="text-sm font-medium">
                  Adresse
                </label>
                <input
                  {...register('shipping_address')}
                  id="shipping_address"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="shipping_postal_code" className="text-sm font-medium">
                  Postnummer
                </label>
                <input
                  {...register('shipping_postal_code')}
                  id="shipping_postal_code"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="shipping_city" className="text-sm font-medium">
                  By
                </label>
                <input
                  {...register('shipping_city')}
                  id="shipping_city"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="shipping_country" className="text-sm font-medium">
                  Land
                </label>
                <input
                  {...register('shipping_country')}
                  id="shipping_country"
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Noter
            </label>
            <textarea
              {...register('notes')}
              id="notes"
              rows={4}
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
                  : 'Opret kunde'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
