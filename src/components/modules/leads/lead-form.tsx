'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Loader2 } from 'lucide-react'
import { createLeadSchema, type CreateLeadInput } from '@/lib/validations/leads'
import { createLead, updateLead, getTeamMembers } from '@/lib/actions/leads'
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  type Lead,
} from '@/types/leads.types'

interface LeadFormProps {
  lead?: Lead
  onClose: () => void
  onSuccess?: () => void
}

export function LeadForm({ lead, onClose, onSuccess }: LeadFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [teamMembers, setTeamMembers] = useState<
    { id: string; full_name: string | null; email: string }[]
  >([])

  const isEditing = !!lead

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateLeadInput>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: lead
      ? {
          company_name: lead.company_name,
          contact_person: lead.contact_person,
          email: lead.email,
          phone: lead.phone,
          status: lead.status,
          source: lead.source,
          value: lead.value,
          probability: lead.probability,
          expected_close_date: lead.expected_close_date,
          notes: lead.notes,
          assigned_to: lead.assigned_to,
          tags: lead.tags,
        }
      : {
          status: 'new',
          source: 'other',
          tags: [],
        },
  })

  useEffect(() => {
    async function loadTeamMembers() {
      const result = await getTeamMembers()
      if (result.success && result.data) {
        setTeamMembers(result.data)
      }
    }
    loadTeamMembers()
  }, [])

  const onSubmit = async (data: CreateLeadInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      if (lead?.id) {
        formData.append('id', lead.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value))
          } else {
            formData.append(key, String(value))
          }
        }
      })

      const result = isEditing
        ? await updateLead(formData)
        : await createLead(formData)

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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            {isEditing ? 'Rediger Lead' : 'Opret Ny Lead'}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company name */}
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
                <p className="text-sm text-red-600">
                  {errors.company_name.message}
                </p>
              )}
            </div>

            {/* Contact person */}
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
                <p className="text-sm text-red-600">
                  {errors.contact_person.message}
                </p>
              )}
            </div>

            {/* Email */}
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

            {/* Phone */}
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
              {errors.phone && (
                <p className="text-sm text-red-600">{errors.phone.message}</p>
              )}
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label htmlFor="status" className="text-sm font-medium">
                Status
              </label>
              <select
                {...register('status')}
                id="status"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div className="space-y-1">
              <label htmlFor="source" className="text-sm font-medium">
                Kilde *
              </label>
              <select
                {...register('source')}
                id="source"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {LEAD_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
              {errors.source && (
                <p className="text-sm text-red-600">{errors.source.message}</p>
              )}
            </div>

            {/* Value */}
            <div className="space-y-1">
              <label htmlFor="value" className="text-sm font-medium">
                Forventet værdi (DKK)
              </label>
              <input
                {...register('value', { valueAsNumber: true })}
                id="value"
                type="number"
                min="0"
                step="1000"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
              {errors.value && (
                <p className="text-sm text-red-600">{errors.value.message}</p>
              )}
            </div>

            {/* Probability */}
            <div className="space-y-1">
              <label htmlFor="probability" className="text-sm font-medium">
                Sandsynlighed (%)
              </label>
              <input
                {...register('probability', { valueAsNumber: true })}
                id="probability"
                type="number"
                min="0"
                max="100"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
              {errors.probability && (
                <p className="text-sm text-red-600">
                  {errors.probability.message}
                </p>
              )}
            </div>

            {/* Expected close date */}
            <div className="space-y-1">
              <label
                htmlFor="expected_close_date"
                className="text-sm font-medium"
              >
                Forventet lukkedato
              </label>
              <input
                {...register('expected_close_date')}
                id="expected_close_date"
                type="date"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>

            {/* Assigned to */}
            <div className="space-y-1">
              <label htmlFor="assigned_to" className="text-sm font-medium">
                Tildelt til
              </label>
              <select
                {...register('assigned_to')}
                id="assigned_to"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                <option value="">Ikke tildelt</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.email}
                  </option>
                ))}
              </select>
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
            {errors.notes && (
              <p className="text-sm text-red-600">{errors.notes.message}</p>
            )}
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
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />}
              {isLoading
                ? 'Gemmer...'
                : isEditing
                  ? 'Gem ændringer'
                  : 'Opret lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
