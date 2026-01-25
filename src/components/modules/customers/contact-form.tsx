'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import {
  createCustomerContactSchema,
  type CreateCustomerContactInput,
} from '@/lib/validations/customers'
import {
  createCustomerContact,
  updateCustomerContact,
} from '@/lib/actions/customers'
import type { CustomerContact } from '@/types/customers.types'

interface ContactFormProps {
  customerId: string
  contact?: CustomerContact
  onClose: () => void
  onSuccess?: () => void
}

export function ContactForm({
  customerId,
  contact,
  onClose,
  onSuccess,
}: ContactFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isEditing = !!contact

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateCustomerContactInput>({
    resolver: zodResolver(createCustomerContactSchema),
    defaultValues: contact
      ? {
          customer_id: customerId,
          name: contact.name,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          mobile: contact.mobile,
          is_primary: contact.is_primary,
          notes: contact.notes,
        }
      : {
          customer_id: customerId,
          is_primary: false,
        },
  })

  const onSubmit = async (data: CreateCustomerContactInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      formData.append('customer_id', customerId)

      if (contact?.id) {
        formData.append('id', contact.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (typeof value === 'boolean') {
            formData.append(key, String(value))
          } else {
            formData.append(key, String(value))
          }
        }
      })

      const result = isEditing
        ? await updateCustomerContact(formData)
        : await createCustomerContact(formData)

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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Rediger Kontakt' : 'Tilføj Kontakt'}
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
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Navn *
            </label>
            <input
              {...register('name')}
              id="name"
              type="text"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="title" className="text-sm font-medium">
              Titel / Stilling
            </label>
            <input
              {...register('title')}
              id="title"
              type="text"
              placeholder="f.eks. Direktør, Indkøbschef"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
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

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="flex items-center gap-2">
            <input
              {...register('is_primary')}
              id="is_primary"
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              disabled={isLoading}
            />
            <label htmlFor="is_primary" className="text-sm font-medium">
              Primær kontakt
            </label>
          </div>

          <div className="space-y-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Noter
            </label>
            <textarea
              {...register('notes')}
              id="notes"
              rows={2}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

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
                  : 'Tilføj kontakt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
