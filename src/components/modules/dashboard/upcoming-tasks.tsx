import Link from 'next/link'
import { format, isPast, isToday } from 'date-fns'
import { da } from 'date-fns/locale'
import { Calendar, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROJECT_PRIORITY_COLORS, PROJECT_PRIORITY_LABELS } from '@/types/projects.types'

interface Task {
  id: string
  title: string
  project_name: string
  project_id: string
  due_date: string | null
  priority: string
  status: string
}

interface UpcomingTasksProps {
  tasks: Task[]
}

export function UpcomingTasks({ tasks }: UpcomingTasksProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Ingen kommende opgaver</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const dueDate = task.due_date ? new Date(task.due_date) : null
        const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate)
        const isDueToday = dueDate && isToday(dueDate)
        const priorityColor = PROJECT_PRIORITY_COLORS[task.priority as keyof typeof PROJECT_PRIORITY_COLORS] || 'bg-gray-100 text-gray-800'

        return (
          <Link
            key={task.id}
            href={`/dashboard/projects/${task.project_id}`}
            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div
              className={cn(
                'p-1.5 rounded-full flex-shrink-0',
                isOverdue
                  ? 'bg-red-100'
                  : isDueToday
                  ? 'bg-yellow-100'
                  : 'bg-gray-100'
              )}
            >
              {isOverdue ? (
                <AlertCircle className="w-4 h-4 text-red-600" />
              ) : (
                <Calendar
                  className={cn(
                    'w-4 h-4',
                    isDueToday ? 'text-yellow-600' : 'text-gray-600'
                  )}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{task.title}</p>
              <p className="text-xs text-muted-foreground">{task.project_name}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  priorityColor
                )}
              >
                {PROJECT_PRIORITY_LABELS[task.priority as keyof typeof PROJECT_PRIORITY_LABELS] || task.priority}
              </span>
              {dueDate && (
                <span
                  className={cn(
                    'text-xs',
                    isOverdue
                      ? 'text-red-600 font-medium'
                      : isDueToday
                      ? 'text-yellow-600 font-medium'
                      : 'text-muted-foreground'
                  )}
                >
                  {isOverdue
                    ? 'Forsinket'
                    : isDueToday
                    ? 'I dag'
                    : format(dueDate, 'd. MMM', { locale: da })}
                </span>
              )}
            </div>
          </Link>
        )
      })}

      <div className="pt-2 text-center">
        <Link href="/dashboard/projects" className="text-sm text-primary hover:underline">
          Se alle projekter →
        </Link>
      </div>
    </div>
  )
}
