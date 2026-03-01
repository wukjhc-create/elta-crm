'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Search,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ClipboardCheck,
  Filter,
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  Eye,
  EyeOff,
  MoreHorizontal,
} from 'lucide-react'
import {
  getAllTasks,
  completeCustomerTask,
  updateCustomerTask,
  deleteCustomerTask,
  createCustomerTask,
  getActiveProfiles,
} from '@/lib/actions/customer-tasks'
import { getCustomersForSelect } from '@/lib/actions/offers'
import {
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '@/types/customer-tasks.types'
import type {
  CustomerTaskWithRelations,
  TaskStatus,
  TaskPriority,
  CreateCustomerTaskInput,
} from '@/types/customer-tasks.types'
import { useToast } from '@/components/ui/toast'

type FilterStatus = TaskStatus | 'all'
type FilterPriority = TaskPriority | 'all'

interface TaskFormData {
  title: string
  description: string
  customer_id: string
  offer_id: string
  priority: TaskPriority
  assigned_to: string
  due_date: string
  reminder_at: string
}

const emptyForm: TaskFormData = {
  title: '',
  description: '',
  customer_id: '',
  offer_id: '',
  priority: 'normal',
  assigned_to: '',
  due_date: '',
  reminder_at: '',
}

export function TasksPageClient() {
  const toast = useToast()
  const [tasks, setTasks] = useState<CustomerTaskWithRelations[]>([])
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [customers, setCustomers] = useState<Array<{ id: string; company_name: string; customer_number: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>('all')
  const [assignedFilter, setAssignedFilter] = useState('all')
  const [showDone, setShowDone] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<CustomerTaskWithRelations | null>(null)
  const [formData, setFormData] = useState<TaskFormData>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [tasksData, profilesData] = await Promise.all([
      getAllTasks({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        assignedTo: assignedFilter !== 'all' ? assignedFilter : undefined,
        search: search || undefined,
      }),
      getActiveProfiles(),
    ])
    setTasks(tasksData)
    setProfiles(profilesData)
    setIsLoading(false)
  }, [statusFilter, priorityFilter, assignedFilter, search])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Load customers on first dialog open
  useEffect(() => {
    if (dialogOpen && customers.length === 0) {
      getCustomersForSelect().then((res) => {
        if (res.success && res.data) setCustomers(res.data)
      })
    }
  }, [dialogOpen, customers.length])

  const handleComplete = async (taskId: string) => {
    const result = await completeCustomerTask(taskId)
    if (result.success) {
      toast.success('Opgave markeret som udført')
      loadData()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleReopen = async (taskId: string) => {
    const result = await updateCustomerTask({ id: taskId, status: 'pending' })
    if (result.success) {
      toast.success('Opgave genåbnet')
      loadData()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (status === 'done') {
      await handleComplete(taskId)
    } else {
      const result = await updateCustomerTask({ id: taskId, status })
      if (result.success) {
        toast.success('Status opdateret')
        loadData()
      } else {
        toast.error('Fejl', result.error)
      }
    }
  }

  const handleDelete = async (taskId: string) => {
    const result = await deleteCustomerTask(taskId)
    if (result.success) {
      toast.success('Opgave slettet')
      setDeleteConfirm(null)
      loadData()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const openCreateDialog = () => {
    setEditingTask(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (task: CustomerTaskWithRelations) => {
    setEditingTask(task)
    setFormData({
      title: task.title,
      description: task.description || '',
      customer_id: task.customer_id,
      offer_id: task.offer_id || '',
      priority: task.priority,
      assigned_to: task.assigned_to || '',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      reminder_at: task.reminder_at ? task.reminder_at.slice(0, 16) : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('Titel er påkrævet')
      return
    }
    if (!editingTask && !formData.customer_id) {
      toast.error('Vælg en kunde')
      return
    }

    setIsSaving(true)
    try {
      if (editingTask) {
        const result = await updateCustomerTask({
          id: editingTask.id,
          title: formData.title,
          description: formData.description || undefined,
          priority: formData.priority,
          assigned_to: formData.assigned_to || null,
          due_date: formData.due_date || null,
          reminder_at: formData.reminder_at || null,
        })
        if (result.success) {
          toast.success('Opgave opdateret')
          setDialogOpen(false)
          loadData()
        } else {
          toast.error('Fejl', result.error)
        }
      } else {
        const input: CreateCustomerTaskInput = {
          customer_id: formData.customer_id,
          title: formData.title,
          description: formData.description || undefined,
          priority: formData.priority,
          assigned_to: formData.assigned_to || undefined,
          due_date: formData.due_date || undefined,
          reminder_at: formData.reminder_at || undefined,
          offer_id: formData.offer_id || undefined,
        }
        const result = await createCustomerTask(input)
        if (result.success) {
          toast.success('Opgave oprettet')
          setDialogOpen(false)
          loadData()
        } else {
          toast.error('Fejl', result.error)
        }
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Filter: hide done tasks unless showDone is true
  const visibleTasks = showDone ? tasks : tasks.filter((t) => t.status !== 'done')

  // Stats (based on unfiltered tasks)
  const pending = tasks.filter((t) => t.status === 'pending').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const done = tasks.filter((t) => t.status === 'done').length
  const overdue = tasks.filter(
    (t) => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Opgaver</h1>
          <p className="text-gray-500">Oversigt over alle opgaver på tværs af kunder</p>
        </div>
        <button
          onClick={openCreateDialog}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ny opgave
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-lg p-3 text-left transition-colors ${statusFilter === 'all' ? 'ring-2 ring-blue-500' : ''} bg-gray-100 text-gray-800`}
        >
          <div className="text-2xl font-bold">{tasks.length}</div>
          <div className="text-xs">Samlet</div>
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`rounded-lg p-3 text-left transition-colors ${statusFilter === 'pending' ? 'ring-2 ring-blue-500' : ''} bg-amber-100 text-amber-800`}
        >
          <div className="text-2xl font-bold">{pending}</div>
          <div className="text-xs">Afventer</div>
        </button>
        <button
          onClick={() => setStatusFilter('in_progress')}
          className={`rounded-lg p-3 text-left transition-colors ${statusFilter === 'in_progress' ? 'ring-2 ring-blue-500' : ''} bg-blue-100 text-blue-800`}
        >
          <div className="text-2xl font-bold">{inProgress}</div>
          <div className="text-xs">I gang</div>
        </button>
        <div className="rounded-lg p-3 bg-red-100 text-red-800">
          <div className="text-2xl font-bold">{overdue}</div>
          <div className="text-xs">Overskredet</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg i opgaver..."
            className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">Alle status</option>
            {Object.entries(TASK_STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as FilterPriority)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">Alle prioriteter</option>
            {Object.entries(TASK_PRIORITY_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">Alle ansvarlige</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowDone(!showDone)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm transition-colors ${showDone ? 'bg-green-50 border-green-300 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
            title={showDone ? 'Skjul udførte' : 'Vis udførte'}
          >
            {showDone ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Udførte ({done})
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Indlæser opgaver...
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ClipboardCheck className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Ingen opgaver fundet</p>
            <p className="text-sm mt-1">
              Klik &quot;Ny opgave&quot; for at oprette en
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_160px_110px_100px_140px_140px_80px] gap-3 px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div></div>
              <div>Opgave</div>
              <div>Kunde</div>
              <div>Status</div>
              <div>Prioritet</div>
              <div>Ansvarlig</div>
              <div>Forfaldsdato</div>
              <div></div>
            </div>

            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                deleteConfirm={deleteConfirm}
                onComplete={() =>
                  task.status === 'done'
                    ? handleReopen(task.id)
                    : handleComplete(task.id)
                }
                onStatusChange={(status) => handleStatusChange(task.id, status)}
                onEdit={() => openEditDialog(task)}
                onDeleteConfirm={() => setDeleteConfirm(task.id)}
                onDeleteCancel={() => setDeleteConfirm(null)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {dialogOpen && (
        <TaskFormDialog
          isEditing={!!editingTask}
          formData={formData}
          setFormData={setFormData}
          profiles={profiles}
          customers={customers}
          isSaving={isSaving}
          onSave={handleSave}
          onClose={() => setDialogOpen(false)}
          disableCustomer={!!editingTask}
        />
      )}
    </div>
  )
}

// =====================================================
// Task Row with inline actions
// =====================================================

function TaskRow({
  task,
  deleteConfirm,
  onComplete,
  onStatusChange,
  onEdit,
  onDeleteConfirm,
  onDeleteCancel,
  onDelete,
}: {
  task: CustomerTaskWithRelations
  deleteConfirm: string | null
  onComplete: () => void
  onStatusChange: (status: TaskStatus) => void
  onEdit: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onDelete: () => void
}) {
  const statusCfg = TASK_STATUS_CONFIG[task.status]
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority]
  const isDone = task.status === 'done'
  const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date()
  const isDeleting = deleteConfirm === task.id

  return (
    <div className={`grid grid-cols-[40px_1fr_160px_110px_100px_140px_140px_80px] gap-3 px-4 py-3 items-center hover:bg-gray-50 transition-colors group ${isDone ? 'opacity-60' : ''}`}>
      {/* Checkbox */}
      <div>
        <button
          onClick={onComplete}
          className="shrink-0"
          aria-label={isDone ? 'Genåbn opgave' : 'Marker som udført'}
        >
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className="w-5 h-5 text-gray-300 hover:text-green-500 transition-colors" />
          )}
        </button>
      </div>

      {/* Title + description */}
      <div className="min-w-0 cursor-pointer" onClick={onEdit}>
        <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        {task.offer && (
          <Link
            href={`/dashboard/offers/${task.offer.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
          >
            <FileText className="w-3 h-3" />
            {task.offer.offer_number}
          </Link>
        )}
        {task.description && !task.offer && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{task.description}</p>
        )}
      </div>

      {/* Customer */}
      <div className="min-w-0">
        {task.customer ? (
          <Link
            href={`/dashboard/customers/${task.customer.id}`}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline truncate"
          >
            {task.customer.company_name}
            <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100" />
          </Link>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </div>

      {/* Status dropdown */}
      <div>
        <select
          value={task.status}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
          className={`text-xs font-medium rounded px-2 py-0.5 border-0 cursor-pointer ${statusCfg.bgColor} ${statusCfg.color}`}
        >
          {Object.entries(TASK_STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityCfg.bgColor} ${priorityCfg.color}`}>
          {priorityCfg.label}
        </span>
      </div>

      {/* Assigned */}
      <div className="min-w-0">
        {task.assigned_profile ? (
          <span className="text-sm text-gray-600 truncate block">
            {task.assigned_profile.full_name || task.assigned_profile.email}
          </span>
        ) : (
          <span className="text-sm text-gray-400">Ikke tildelt</span>
        )}
      </div>

      {/* Due date */}
      <div>
        {task.due_date ? (
          <span className={`inline-flex items-center gap-1 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
            {isOverdue && <AlertTriangle className="w-3.5 h-3.5" />}
            <Clock className="w-3.5 h-3.5" />
            {format(new Date(task.due_date), 'd. MMM yyyy', { locale: da })}
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end">
        {isDeleting ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onDelete}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
              aria-label="Bekræft sletning"
              title="Bekræft"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDeleteCancel}
              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
              aria-label="Annuller sletning"
              title="Annuller"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              aria-label="Rediger opgave"
              title="Rediger"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDeleteConfirm}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              aria-label="Slet opgave"
              title="Slet"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================
// Task Form Dialog (Create / Edit)
// =====================================================

function TaskFormDialog({
  isEditing,
  formData,
  setFormData,
  profiles,
  customers,
  isSaving,
  onSave,
  onClose,
  disableCustomer,
}: {
  isEditing: boolean
  formData: TaskFormData
  setFormData: React.Dispatch<React.SetStateAction<TaskFormData>>
  profiles: Array<{ id: string; full_name: string | null; email: string }>
  customers: Array<{ id: string; company_name: string; customer_number: string }>
  isSaving: boolean
  onSave: () => void
  onClose: () => void
  disableCustomer: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="task-dialog-title" className="text-lg font-semibold">
            {isEditing ? 'Rediger opgave' : 'Ny opgave'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded" aria-label="Luk">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              placeholder="Hvad skal gøres?"
              className="w-full px-3 py-2 border rounded-md text-sm"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              placeholder="Yderligere detaljer..."
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm resize-none"
            />
          </div>

          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kunde *</label>
            <select
              value={formData.customer_id}
              onChange={(e) => setFormData((f) => ({ ...f, customer_id: e.target.value }))}
              disabled={disableCustomer}
              className="w-full px-3 py-2 border rounded-md text-sm disabled:bg-gray-100"
            >
              <option value="">Vælg kunde...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name} ({c.customer_number})
                </option>
              ))}
            </select>
          </div>

          {/* Priority + Assigned */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                {Object.entries(TASK_PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ansvarlig</label>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData((f) => ({ ...f, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="">Mig selv</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Due date + Reminder */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forfaldsdato</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Påmindelse</label>
              <input
                type="datetime-local"
                value={formData.reminder_at}
                onChange={(e) => setFormData((f) => ({ ...f, reminder_at: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Annuller
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditing ? 'Gem ændringer' : 'Opret opgave'}
          </button>
        </div>
      </div>
    </div>
  )
}
