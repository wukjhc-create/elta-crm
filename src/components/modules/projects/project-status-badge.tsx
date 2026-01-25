import { cn } from '@/lib/utils'
import {
  type ProjectStatus,
  type ProjectPriority,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_COLORS,
} from '@/types/projects.types'

interface ProjectStatusBadgeProps {
  status: ProjectStatus
  className?: string
}

export function ProjectStatusBadge({ status, className }: ProjectStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        PROJECT_STATUS_COLORS[status],
        className
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  )
}

interface ProjectPriorityBadgeProps {
  priority: ProjectPriority
  className?: string
}

export function ProjectPriorityBadge({ priority, className }: ProjectPriorityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        PROJECT_PRIORITY_COLORS[priority],
        className
      )}
    >
      {PROJECT_PRIORITY_LABELS[priority]}
    </span>
  )
}
