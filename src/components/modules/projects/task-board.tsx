'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Clock,
  User,
  Calendar,
  GripVertical,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { updateTaskStatus, deleteTask } from '@/lib/actions/projects'
import { useToast } from '@/components/ui/toast'
import { ProjectPriorityBadge } from './project-status-badge'
import { TaskForm } from './task-form'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  type TaskStatus,
  type ProjectTaskWithRelations,
} from '@/types/projects.types'

interface TaskBoardProps {
  projectId: string
  tasks: ProjectTaskWithRelations[]
  onRefresh?: () => void
}

interface TaskCardProps {
  task: ProjectTaskWithRelations
  onEdit: (task: ProjectTaskWithRelations) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.DragEvent, taskId: string) => void
}

function TaskCard({ task, onEdit, onDelete, onDragStart }: TaskCardProps) {
  const [openMenu, setOpenMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Er du sikker på at du vil slette denne opgave?')) return
    setIsDeleting(true)
    await onDelete(task.id)
    setIsDeleting(false)
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <h4 className="font-medium text-sm">{task.title}</h4>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setOpenMenu(!openMenu)}
            className="p-1 hover:bg-muted rounded"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {openMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(false)} />
              <div className="absolute right-0 mt-1 w-36 bg-white border rounded-md shadow-lg z-20">
                <button
                  onClick={() => {
                    onEdit(task)
                    setOpenMenu(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                >
                  <Pencil className="w-4 h-4" />
                  Rediger
                </button>
                <button
                  onClick={() => {
                    handleDelete()
                    setOpenMenu(false)
                  }}
                  disabled={isDeleting}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? 'Sletter...' : 'Slet'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <ProjectPriorityBadge priority={task.priority} className="text-[10px] px-1.5 py-0.5" />

        {task.estimated_hours && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {task.actual_hours}/{task.estimated_hours}t
          </span>
        )}

        {task.due_date && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>

      {task.assigned_to_profile && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <User className="w-3 h-3" />
          {task.assigned_to_profile.full_name || task.assigned_to_profile.email}
        </div>
      )}
    </div>
  )
}

export function TaskBoard({ projectId, tasks, onRefresh }: TaskBoardProps) {
  const router = useRouter()
  const toast = useToast()
  const [editingTask, setEditingTask] = useState<ProjectTaskWithRelations | null>(null)
  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo')
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)

  const tasksByStatus = TASK_STATUSES.reduce((acc, status) => {
    acc[status] = tasks.filter((task) => task.status === status)
    return acc
  }, {} as Record<TaskStatus, ProjectTaskWithRelations[]>)

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault()
    if (!draggedTaskId) return

    const task = tasks.find((t) => t.id === draggedTaskId)
    if (!task || task.status === newStatus) {
      setDraggedTaskId(null)
      return
    }

    try {
      await updateTaskStatus(draggedTaskId, newStatus, projectId)
      router.refresh()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to update task status:', error)
      toast.error('Kunne ikke opdatere opgavestatus')
    }

    setDraggedTaskId(null)
  }

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteTask(id, projectId)
      router.refresh()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to delete task:', error)
      toast.error('Kunne ikke slette opgave')
    }
  }

  const handleAddTask = (status: TaskStatus) => {
    setNewTaskStatus(status)
    setShowNewTaskForm(true)
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_STATUSES.map((status) => (
          <div
            key={status}
            className="flex-shrink-0 w-72"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            {/* Column Header */}
            <div className={`rounded-t-lg p-3 ${TASK_STATUS_COLORS[status]}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">
                  {TASK_STATUS_LABELS[status]}
                </h3>
                <span className="text-xs bg-white/50 px-2 py-0.5 rounded-full">
                  {tasksByStatus[status].length}
                </span>
              </div>
            </div>

            {/* Column Body */}
            <div className="bg-muted/30 rounded-b-lg p-2 min-h-[300px] space-y-2">
              {tasksByStatus[status].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={setEditingTask}
                  onDelete={handleDeleteTask}
                  onDragStart={handleDragStart}
                />
              ))}

              {/* Add Task Button */}
              <button
                onClick={() => handleAddTask(status)}
                className="w-full flex items-center justify-center gap-1 p-2 text-sm text-muted-foreground hover:bg-white hover:text-foreground rounded-md border-2 border-dashed border-muted-foreground/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tilføj opgave
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Task Form Modal */}
      {(showNewTaskForm || editingTask) && (
        <TaskForm
          projectId={projectId}
          task={editingTask || undefined}
          onClose={() => {
            setShowNewTaskForm(false)
            setEditingTask(null)
          }}
          onSuccess={() => {
            setShowNewTaskForm(false)
            setEditingTask(null)
            router.refresh()
            onRefresh?.()
          }}
        />
      )}
    </>
  )
}
