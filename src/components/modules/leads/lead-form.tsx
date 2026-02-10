'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Loader2 } from 'lucide-react'
import { createLeadSchema, type CreateLeadInput } from '@/lib/validations/leads'
import { createLead, updateLead, getTeamMembers } from '@/lib/actions/leads'
import { FormField, inputClass } from '@/components/shared/form-field'
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

  const handleEscape = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => {
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape])

  const {
    register,
    handleSubmit,
    setFocus,
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
      <div role="dialog" aria-modal="true" aria-labelledby="lead-form-title" className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="lead-form-title" className="text-xl font-semibold">
            {isEditing ? 'Rediger Lead' : 'Opret Ny Lead'}
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

        <form onSubmit={handleSubmit(onSubmit, (fieldErrors) => {
          const firstField = Object.keys(fieldErrors)[0] as keyof CreateLeadInput
          if (firstField) setFocus(firstField)
        })} className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Firmanavn" htmlFor="company_name" required error={errors.company_name}>
              <input {...register('company_name')} id="company_name" type="text" className={inputClass(!!errors.company_name)} disabled={isLoading} />
            </FormField>

            <FormField label="Kontaktperson" htmlFor="contact_person" required error={errors.contact_person}>
              <input {...register('contact_person')} id="contact_person" type="text" className={inputClass(!!errors.contact_person)} disabled={isLoading} />
            </FormField>

            <FormField label="E-mail" htmlFor="email" required error={errors.email}>
              <input {...register('email')} id="email" type="email" className={inputClass(!!errors.email)} disabled={isLoading} />
            </FormField>

            <FormField label="Telefon" htmlFor="phone" error={errors.phone}>
              <input {...register('phone')} id="phone" type="tel" className={inputClass(!!errors.phone)} disabled={isLoading} />
            </FormField>

            <FormField label="Status" htmlFor="status">
              <select {...register('status')} id="status" className={inputClass()} disabled={isLoading}>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>{LEAD_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Kilde" htmlFor="source" required error={errors.source}>
              <select {...register('source')} id="source" className={inputClass(!!errors.source)} disabled={isLoading}>
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Forventet værdi (DKK)" htmlFor="value" error={errors.value}>
              <input {...register('value', { valueAsNumber: true })} id="value" type="number" min="0" step="1000" className={inputClass(!!errors.value)} disabled={isLoading} />
            </FormField>

            <FormField label="Sandsynlighed (%)" htmlFor="probability" error={errors.probability}>
              <input {...register('probability', { valueAsNumber: true })} id="probability" type="number" min="0" max="100" className={inputClass(!!errors.probability)} disabled={isLoading} />
            </FormField>

            <FormField label="Forventet lukkedato" htmlFor="expected_close_date">
              <input {...register('expected_close_date')} id="expected_close_date" type="date" className={inputClass()} disabled={isLoading} />
            </FormField>

            <FormField label="Tildelt til" htmlFor="assigned_to">
              <select {...register('assigned_to')} id="assigned_to" className={inputClass()} disabled={isLoading}>
                <option value="">Ikke tildelt</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name || member.email}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Noter" htmlFor="notes" error={errors.notes}>
            <textarea {...register('notes')} id="notes" rows={4} className={`${inputClass(!!errors.notes)} resize-none`} disabled={isLoading} />
          </FormField>

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
