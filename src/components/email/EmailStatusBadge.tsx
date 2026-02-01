'use client'

/**
 * EMAIL STATUS BADGE
 *
 * Visual indicator for email/thread status
 */

import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Clock,
  Send,
  CheckCircle,
  Eye,
  MousePointer,
  XCircle,
  AlertTriangle,
  MessageCircle,
} from 'lucide-react'
import type { EmailThreadStatus, EmailMessageStatus } from '@/types/email.types'
import {
  THREAD_STATUS_LABELS,
  THREAD_STATUS_COLORS,
  MESSAGE_STATUS_LABELS,
  MESSAGE_STATUS_COLORS,
} from '@/types/email.types'

interface EmailStatusBadgeProps {
  status: EmailThreadStatus | EmailMessageStatus
  type?: 'thread' | 'message'
  showIcon?: boolean
  size?: 'sm' | 'default'
}

const THREAD_ICONS: Record<EmailThreadStatus, React.ReactNode> = {
  draft: <FileText className="h-3 w-3" />,
  sent: <Send className="h-3 w-3" />,
  opened: <Eye className="h-3 w-3" />,
  replied: <MessageCircle className="h-3 w-3" />,
  closed: <CheckCircle className="h-3 w-3" />,
}

const MESSAGE_ICONS: Record<EmailMessageStatus, React.ReactNode> = {
  draft: <FileText className="h-3 w-3" />,
  queued: <Clock className="h-3 w-3" />,
  sent: <Send className="h-3 w-3" />,
  delivered: <CheckCircle className="h-3 w-3" />,
  opened: <Eye className="h-3 w-3" />,
  clicked: <MousePointer className="h-3 w-3" />,
  bounced: <XCircle className="h-3 w-3" />,
  failed: <AlertTriangle className="h-3 w-3" />,
}

export function EmailStatusBadge({
  status,
  type = 'thread',
  showIcon = true,
  size = 'default',
}: EmailStatusBadgeProps) {
  const isThread = type === 'thread'

  const labels = isThread ? THREAD_STATUS_LABELS : MESSAGE_STATUS_LABELS
  const colors = isThread ? THREAD_STATUS_COLORS : MESSAGE_STATUS_COLORS
  const icons = isThread ? THREAD_ICONS : MESSAGE_ICONS

  const label = labels[status as keyof typeof labels] || status
  const color = colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-700'
  const icon = icons[status as keyof typeof icons]

  return (
    <Badge
      variant="secondary"
      className={`${color} ${size === 'sm' ? 'text-xs px-1.5 py-0' : ''}`}
    >
      {showIcon && icon && <span className="mr-1">{icon}</span>}
      {label}
    </Badge>
  )
}

/**
 * Compact indicator for lists
 */
export function EmailStatusIndicator({
  status,
  type = 'message',
}: {
  status: EmailMessageStatus | EmailThreadStatus
  type?: 'thread' | 'message'
}) {
  const isOpened = status === 'opened' || status === 'clicked' || status === 'replied'
  const isSent = status === 'sent' || status === 'delivered'
  const isFailed = status === 'bounced' || status === 'failed'

  if (isFailed) {
    return <span title="Fejlet"><XCircle className="h-4 w-4 text-red-500" /></span>
  }

  if (isOpened) {
    return <span title="Åbnet"><Eye className="h-4 w-4 text-green-500" /></span>
  }

  if (isSent) {
    return <span title="Sendt"><CheckCircle className="h-4 w-4 text-blue-500" /></span>
  }

  return <span title="Afventer"><Clock className="h-4 w-4 text-gray-400" /></span>
}
