'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { createTimeEntrySchema, type CreateTimeEntryInput } from '@/lib/validations/projects'
import { createTimeEntry, updateTimeEntry } from '@/lib/actions/projects'
import type { TimeEntry, ProjectTask } from '@/types/projects.types'

interface TimeEntryFormProps {
  projectId: string
  tasks?: ProjectTask[]
  timeEntry?: TimeEntry
  onClose: () => void
  onSuccess?: (entry: TimeEntry) => void
}

export function TimeEntryForm({
  projectId,
  tasks = [],
  timeEntry,
  onClose,
  onSuccess,
}: TimeEntryFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isEditing = !!timeEntry

  const today = new Date().toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTimeEntryInput>({
    resolver: zodResolver(createTimeEntrySchema),
    defaultValues: timeEntry
      ? {
          project_id: projectId,
          task_id: timeEntry.task_id,
          description: timeEntry.description,
          hours: timeEntry.hours,
          date: timeEntry.date,
          billable: timeEntry.billable,
        }
      : {
          project_id: projectId,
          date: today,
          billable: true,
          hours: 1,
        },
  })

  const onSubmit = async (data: CreateTimeEntryInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      if (timeEntry?.id) {
        formData.append('id', timeEntry.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (key === 'billable') {
            formData.append(key, value ? 'true' : 'false')
          } else {
            formData.append(key, String(value))
          }
        }
      })

      const result = isEditing
        ? await updateTimeEntry(formData)
        : await createTimeEntry(formData)

      if (!result.success) {
        setError(result.error || 'Der opstod en fejl')
        return
      }

      if (result.data) {
        onSuccess?.(result.data)
      }
      onClose()
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
          <h2 className="text-xl font-semibold">
            {isEditing ? 'Rediger Tidsregistrering' : 'Registrer Tid'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Hidden project_id */}
          <input type="hidden" {...register('project_id')} value={projectId} />

          {/* Date */}
          <div className="space-y-1">
            <label htmlFor="date" className="text-sm font-medium">
              Dato *
            </label>
            <input
              {...register('date')}
              id="date"
              type="date"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            {errors.date && (
              <p className="text-sm text-red-600">{errors.date.message}</p>
            )}
          </div>

          {/* Hours */}
          <div className="space-y-1">
            <label htmlFor="hours" className="text-sm font-medium">
              Timer *
            </label>
            <input
              {...register('hours', { valueAsNumber: true })}
              id="hours"
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            {errors.hours && (
              <p className="text-sm text-red-600">{errors.hours.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Minimum 0.25 timer (15 min), maximum 24 timer
            </p>
          </div>

          {/* Task (optional) */}
          {tasks.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="task_id" className="text-sm font-medium">
                Opgave (valgfri)
              </label>
              <select
                {...register('task_id')}
                id="task_id"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              >
                <option value="">Generelt projektarbejde...</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="description" className="text-sm font-medium">
              Beskrivelse
            </label>
            <textarea
              {...register('description')}
              id="description"
              rows={2}
              placeholder="Hvad har du arbejdet på?"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Billable */}
          <div className="flex items-center gap-2">
            <input
              {...register('billable')}
              id="billable"
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              disabled={isLoading}
            />
            <label htmlFor="billable" className="text-sm font-medium">
              Fakturerbar tid
            </label>
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
              {isLoading ? 'Gemmer...' : isEditing ? 'Gem ændringer' : 'Registrer tid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
