'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { createProjectSchema, type CreateProjectInput } from '@/lib/validations/projects'
import {
  createProject,
  updateProject,
  getCustomersForProjectSelect,
  getTeamMembersForProject,
  getOffersForProject,
} from '@/lib/actions/projects'
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  type Project,
} from '@/types/projects.types'

interface ProjectFormProps {
  project?: Project
  onClose: () => void
  onSuccess?: (project: Project) => void
}

export function ProjectForm({ project, onClose, onSuccess }: ProjectFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [customers, setCustomers] = useState<
    { id: string; company_name: string; customer_number: string }[]
  >([])
  const [teamMembers, setTeamMembers] = useState<
    { id: string; full_name: string | null; email: string }[]
  >([])
  const [offers, setOffers] = useState<
    { id: string; offer_number: string; title: string }[]
  >([])

  const isEditing = !!project
  const { confirm: confirmUnsaved, ConfirmDialog } = useConfirm()

  const {
    register,
    handleSubmit,
    watch,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: project
      ? {
          name: project.name,
          description: project.description,
          status: project.status,
          priority: project.priority,
          customer_id: project.customer_id,
          offer_id: project.offer_id,
          start_date: project.start_date,
          end_date: project.end_date,
          estimated_hours: project.estimated_hours,
          budget: project.budget,
          project_manager_id: project.project_manager_id,
          notes: project.notes,
        }
      : {
          status: 'planning',
          priority: 'medium',
        },
  })

  const safeClose = async () => {
    if (isDirty) {
      const ok = await confirmUnsaved({
        title: 'Ugemte ændringer',
        description: 'Du har ændringer der ikke er gemt. Vil du kassere dem?',
        confirmLabel: 'Kassér',
        variant: 'warning',
      })
      if (!ok) return
    }
    onClose()
  }

  const handleEscape = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') safeClose() }, [isDirty])
  useEffect(() => {
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape])

  useEffect(() => { setFocus('name') }, [setFocus])

  const customerId = watch('customer_id')

  useEffect(() => {
    async function loadData() {
      const [customersResult, teamResult] = await Promise.all([
        getCustomersForProjectSelect(),
        getTeamMembersForProject(),
      ])

      if (customersResult.success && customersResult.data) {
        setCustomers(customersResult.data)
      }
      if (teamResult.success && teamResult.data) {
        setTeamMembers(teamResult.data)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    async function loadOffers() {
      if (customerId) {
        const result = await getOffersForProject(customerId)
        if (result.success && result.data) {
          setOffers(result.data)
        }
      } else {
        setOffers([])
      }
    }
    loadOffers()
  }, [customerId])

  const onSubmit = async (data: CreateProjectInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      if (project?.id) {
        formData.append('id', project.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, String(value))
        }
      })

      const result = isEditing
        ? await updateProject(formData)
        : await createProject(formData)

      if (!result.success) {
        setError(result.error || 'Der opstod en fejl')
        return
      }

      if (result.data) {
        onSuccess?.(result.data)
      }
      onClose()
      router.refresh()

      if (!isEditing && result.data) {
        router.push(`/dashboard/projects/${result.data.id}`)
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
      <div role="dialog" aria-modal="true" aria-labelledby="project-form-title" className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 id="project-form-title" className="text-xl font-semibold">
            {isEditing ? 'Rediger Projekt' : 'Opret Nyt Projekt'}
          </h2>
          <button onClick={safeClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Projektnavn *
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

          {/* Customer */}
          <div className="space-y-1">
            <label htmlFor="customer_id" className="text-sm font-medium">
              Kunde *
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
            {errors.customer_id && (
              <p className="text-sm text-red-600">{errors.customer_id.message}</p>
            )}
          </div>

          {/* Offer (if customer selected) */}
          {customerId && offers.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="offer_id" className="text-sm font-medium">
                Relateret tilbud
              </label>
              <select
                {...register('offer_id')}
                id="offer_id"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                <option value="">Intet tilbud...</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.offer_number} - {offer.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
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
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="priority" className="text-sm font-medium">
                Prioritet
              </label>
              <select
                {...register('priority')}
                id="priority"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                {PROJECT_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PROJECT_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Project Manager */}
          <div className="space-y-1">
            <label htmlFor="project_manager_id" className="text-sm font-medium">
              Projektleder
            </label>
            <select
              {...register('project_manager_id')}
              id="project_manager_id"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            >
              <option value="">Vælg projektleder...</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || member.email}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="start_date" className="text-sm font-medium">
                Startdato
              </label>
              <input
                {...register('start_date')}
                id="start_date"
                type="date"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="end_date" className="text-sm font-medium">
                Slutdato
              </label>
              <input
                {...register('end_date')}
                id="end_date"
                type="date"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Budget & Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="estimated_hours" className="text-sm font-medium">
                Estimerede timer
              </label>
              <input
                {...register('estimated_hours', { valueAsNumber: true })}
                id="estimated_hours"
                type="number"
                min="0"
                step="0.5"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="budget" className="text-sm font-medium">
                Budget (DKK)
              </label>
              <input
                {...register('budget', { valueAsNumber: true })}
                id="budget"
                type="number"
                min="0"
                step="100"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
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

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Interne noter
            </label>
            <textarea
              {...register('notes')}
              id="notes"
              rows={2}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={safeClose}
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
              {isLoading ? 'Gemmer...' : isEditing ? 'Gem ændringer' : 'Opret projekt'}
            </button>
          </div>
        </form>
      </div>
      {ConfirmDialog}
    </div>
  )
}
