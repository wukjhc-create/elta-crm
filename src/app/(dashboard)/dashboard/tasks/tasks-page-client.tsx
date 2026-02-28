'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import {
  getAllTasks,
  completeCustomerTask,
  updateCustomerTask,
  getActiveProfiles,
} from '@/lib/actions/customer-tasks'
import {
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '@/types/customer-tasks.types'
import type {
  CustomerTaskWithRelations,
  TaskStatus,
  TaskPriority,
} from '@/types/customer-tasks.types'
import { useToast } from '@/components/ui/toast'

type FilterStatus = TaskStatus | 'all'
type FilterPriority = TaskPriority | 'all'

export function TasksPageClient() {
  const toast = useToast()
  const [tasks, setTasks] = useState<CustomerTaskWithRelations[]>([])
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>('all')
  const [assignedFilter, setAssignedFilter] = useState('all')

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

  // Stats
  const pending = tasks.filter((t) => t.status === 'pending').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const done = tasks.filter((t) => t.status === 'done').length
  const overdue = tasks.filter(
    (t) => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Opgaver</h1>
        <p className="text-gray-500">Oversigt over alle opgaver på tværs af kunder</p>
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
        </div>
      </div>

      {/* Task list */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Indlæser opgaver...
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ClipboardCheck className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Ingen opgaver fundet</p>
            <p className="text-sm mt-1">Opret opgaver fra kundekortet</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_160px_100px_100px_140px_140px] gap-3 px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div></div>
              <div>Opgave</div>
              <div>Kunde</div>
              <div>Status</div>
              <div>Prioritet</div>
              <div>Ansvarlig</div>
              <div>Forfaldsdato</div>
            </div>

            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={() =>
                  task.status === 'done'
                    ? handleReopen(task.id)
                    : handleComplete(task.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================
// Task Row
// =====================================================

function TaskRow({
  task,
  onComplete,
}: {
  task: CustomerTaskWithRelations
  onComplete: () => void
}) {
  const statusCfg = TASK_STATUS_CONFIG[task.status]
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority]
  const isDone = task.status === 'done'
  const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date()

  return (
    <div className={`grid grid-cols-[40px_1fr_160px_100px_100px_140px_140px] gap-3 px-4 py-3 items-center hover:bg-gray-50 transition-colors group ${isDone ? 'opacity-60' : ''}`}>
      {/* Checkbox */}
      <div>
        <button
          onClick={onComplete}
          className="shrink-0"
          title={isDone ? 'Genåbn' : 'Marker som udført'}
        >
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className="w-5 h-5 text-gray-300 hover:text-green-500 transition-colors" />
          )}
        </button>
      </div>

      {/* Title + description */}
      <div className="min-w-0">
        <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        {task.offer && (
          <Link
            href={`/dashboard/offers/${task.offer.id}`}
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

      {/* Status */}
      <div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
          {statusCfg.label}
        </span>
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
    </div>
  )
}
