import { cn } from '@/lib/utils'
import {
  type MessageStatus,
  type MessageType,
  MESSAGE_STATUS_LABELS,
  MESSAGE_STATUS_COLORS,
  MESSAGE_TYPE_LABELS,
  MESSAGE_TYPE_COLORS,
} from '@/types/messages.types'

interface MessageStatusBadgeProps {
  status: MessageStatus
  className?: string
}

export function MessageStatusBadge({ status, className }: MessageStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        MESSAGE_STATUS_COLORS[status],
        className
      )}
    >
      {MESSAGE_STATUS_LABELS[status]}
    </span>
  )
}

interface MessageTypeBadgeProps {
  type: MessageType
  className?: string
}

export function MessageTypeBadge({ type, className }: MessageTypeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        MESSAGE_TYPE_COLORS[type],
        className
      )}
    >
      {MESSAGE_TYPE_LABELS[type]}
    </span>
  )
}
