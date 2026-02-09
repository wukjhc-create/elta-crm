'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { createTaskSchema, type CreateTaskInput } from '@/lib/validations/projects'
import { createTask, updateTask, getTeamMembersForProject } from '@/lib/actions/projects'
import {
  TASK_STATUSES,
  PROJECT_PRIORITIES,
  TASK_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  type ProjectTask,
} from '@/types/projects.types'

interface TaskFormProps {
  projectId: string
  task?: ProjectTask
  onClose: () => void
  onSuccess?: (task: ProjectTask) => void
}

export function TaskForm({ projectId, task, onClose, onSuccess }: TaskFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [teamMembers, setTeamMembers] = useState<
    { id: string; full_name: string | null; email: string }[]
  >([])

  const isEditing = !!task

  const handleEscape = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => {
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: task
      ? {
          project_id: projectId,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigned_to: task.assigned_to,
          estimated_hours: task.estimated_hours,
          due_date: task.due_date,
        }
      : {
          project_id: projectId,
          status: 'todo',
          priority: 'medium',
        },
  })

  useEffect(() => {
    async function loadTeamMembers() {
      const result = await getTeamMembersForProject()
      if (result.success && result.data) {
        setTeamMembers(result.data)
      }
    }
    loadTeamMembers()
  }, [])

  const onSubmit = async (data: CreateTaskInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      if (task?.id) {
        formData.append('id', task.id)
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, String(value))
        }
      })

      const result = isEditing
        ? await updateTask(formData)
        : await createTask(formData)

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
      <div role="dialog" aria-modal="true" aria-labelledby="task-form-title" className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 id="task-form-title" className="text-xl font-semibold">
            {isEditing ? 'Rediger Opgave' : 'Opret Ny Opgave'}
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

          {/* Title */}
          <div className="space-y-1">
            <label htmlFor="title" className="text-sm font-medium">
              Titel *
            </label>
            <input
              {...register('title')}
              id="title"
              type="text"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title.message}</p>
            )}
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
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
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

          {/* Assigned To */}
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
              <option value="">Ikke tildelt...</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || member.email}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date & Estimated Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="due_date" className="text-sm font-medium">
                Deadline
              </label>
              <input
                {...register('due_date')}
                id="due_date"
                type="date"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>

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
              {isLoading ? 'Gemmer...' : isEditing ? 'Gem ændringer' : 'Opret opgave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
