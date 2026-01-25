import { cn } from '@/lib/utils'
import {
  type LeadStatus,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
} from '@/types/leads.types'

interface LeadStatusBadgeProps {
  status: LeadStatus
  className?: string
}

export function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        LEAD_STATUS_COLORS[status],
        className
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}
