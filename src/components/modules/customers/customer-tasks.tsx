'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import {
  getCustomerTasks,
  createCustomerTask,
  completeCustomerTask,
  deleteCustomerTask,
  updateCustomerTask,
  getActiveProfiles,
} from '@/lib/actions/customer-tasks'
import {
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '@/types/customer-tasks.types'
import type {
  CustomerTaskWithRelations,
  CreateCustomerTaskInput,
  TaskStatus,
  TaskPriority,
} from '@/types/customer-tasks.types'
import { useToast } from '@/components/ui/toast'

interface CustomerTasksProps {
  customerId: string
}

export function CustomerTasks({ customerId }: CustomerTasksProps) {
  const toast = useToast()
  const [tasks, setTasks] = useState<CustomerTaskWithRelations[]>([])
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<CustomerTaskWithRelations | null>(null)
  const [showDone, setShowDone] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    const [tasksData, profilesData] = await Promise.all([
      getCustomerTasks(customerId),
      getActiveProfiles(),
    ])
    setTasks(tasksData)
    setProfiles(profilesData)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const handleComplete = async (taskId: string) => {
    const result = await completeCustomerTask(taskId)
    if (result.success) {
      toast.success('Opgave markeret som udført')
      loadData()
    } else {
      toast.error('Kunne ikke fuldføre opgave', result.error)
    }
  }

  const handleDelete = async (taskId: string) => {
    const result = await deleteCustomerTask(taskId)
    if (result.success) {
      toast.success('Opgave slettet')
      loadData()
    } else {
      toast.error('Kunne ikke slette opgave', result.error)
    }
  }

  const handleReopen = async (taskId: string) => {
    const result = await updateCustomerTask({ id: taskId, status: 'pending' })
    if (result.success) {
      toast.success('Opgave genåbnet')
      loadData()
    } else {
      toast.error('Kunne ikke genåbne opgave', result.error)
    }
  }

  const activeTasks = tasks.filter((t) => t.status !== 'done')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Opgaver</h2>
        <button
          onClick={() => { setEditingTask(null); setShowForm(true) }}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="w-4 h-4" />
          Ny opgave
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Indlæser...
        </div>
      ) : activeTasks.length === 0 && doneTasks.length === 0 ? (
        <p className="text-gray-500 text-center py-4">Ingen opgaver endnu</p>
      ) : (
        <div className="space-y-2">
          {activeTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => handleComplete(task.id)}
              onEdit={() => { setEditingTask(task); setShowForm(true) }}
              onDelete={() => handleDelete(task.id)}
            />
          ))}

          {doneTasks.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowDone(!showDone)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showDone ? 'Skjul' : 'Vis'} udførte ({doneTasks.length})
              </button>
              {showDone && (
                <div className="mt-2 space-y-2 opacity-60">
                  {doneTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onComplete={() => handleReopen(task.id)}
                      onEdit={() => { setEditingTask(task); setShowForm(true) }}
                      onDelete={() => handleDelete(task.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <TaskForm
          customerId={customerId}
          profiles={profiles}
          task={editingTask}
          onClose={() => { setShowForm(false); setEditingTask(null) }}
          onSuccess={() => { setShowForm(false); setEditingTask(null); loadData() }}
        />
      )}
    </div>
  )
}

// =====================================================
// Task Row
// =====================================================

function TaskRow({
  task,
  onComplete,
  onEdit,
  onDelete,
}: {
  task: CustomerTaskWithRelations
  onComplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const statusCfg = TASK_STATUS_CONFIG[task.status]
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority]
  const isDone = task.status === 'done'
  const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date()

  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg group">
      <button
        onClick={onComplete}
        className="mt-0.5 shrink-0"
        title={isDone ? 'Genåbn' : 'Marker som udført'}
      >
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 hover:text-green-500" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
          {task.priority !== 'normal' && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${priorityCfg.bgColor} ${priorityCfg.color}`}>
              {priorityCfg.label}
            </span>
          )}
          {task.assigned_profile && (
            <span className="text-xs text-gray-500">
              {task.assigned_profile.full_name || task.assigned_profile.email}
            </span>
          )}
          {task.due_date && (
            <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              {isOverdue && <AlertTriangle className="w-3 h-3" />}
              <Clock className="w-3 h-3" />
              {format(new Date(task.due_date), 'd. MMM yyyy', { locale: da })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1 hover:bg-gray-200 rounded">
          <Pencil className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <button onClick={onDelete} className="p-1 hover:bg-red-100 rounded">
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </button>
      </div>
    </div>
  )
}

// =====================================================
// Task Form (inline modal)
// =====================================================

function TaskForm({
  customerId,
  profiles,
  task,
  onClose,
  onSuccess,
}: {
  customerId: string
  profiles: Array<{ id: string; full_name: string | null; email: string }>
  task: CustomerTaskWithRelations | null
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'normal')
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'pending')
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || '')
  const [dueDate, setDueDate] = useState(task?.due_date ? task.due_date.slice(0, 16) : '')
  const [reminderAt, setReminderAt] = useState(task?.reminder_at ? task.reminder_at.slice(0, 16) : '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSaving(true)

    if (task) {
      // Update
      const result = await updateCustomerTask({
        id: task.id,
        title: title.trim(),
        description: description.trim() || null as unknown as undefined,
        priority,
        status,
        assigned_to: assignedTo || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
      })
      if (result.success) {
        toast.success('Opgave opdateret')
        onSuccess()
      } else {
        toast.error('Kunne ikke opdatere opgave', result.error)
      }
    } else {
      // Create
      const input: CreateCustomerTaskInput = {
        customer_id: customerId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigned_to: assignedTo || undefined,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        reminder_at: reminderAt ? new Date(reminderAt).toISOString() : undefined,
      }
      const result = await createCustomerTask(input)
      if (result.success) {
        toast.success('Opgave oprettet')
        onSuccess()
      } else {
        toast.error('Kunne ikke oprette opgave', result.error)
      }
    }

    setIsSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {task ? 'Rediger opgave' : 'Ny opgave'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
              placeholder="Hvad skal gøres?"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
              rows={2}
              placeholder="Yderligere detaljer..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                {Object.entries(TASK_PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>

            {task && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  {Object.entries(TASK_STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ansvarlig</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="">Vælg...</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forfaldsdato</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Påmindelse</label>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Gemmer...' : task ? 'Opdater' : 'Opret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
