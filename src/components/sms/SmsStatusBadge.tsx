'use client'

/**
 * SMS STATUS BADGE
 *
 * Visual indicator for SMS message status
 */

import { Badge } from '@/components/ui/badge'
import {
  Clock,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import type { SmsMessageStatus } from '@/types/sms.types'
import { SMS_STATUS_LABELS, SMS_STATUS_COLORS } from '@/types/sms.types'

interface SmsStatusBadgeProps {
  status: SmsMessageStatus
  showIcon?: boolean
  size?: 'sm' | 'default'
}

const STATUS_ICONS: Record<SmsMessageStatus, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  queued: <Loader2 className="h-3 w-3 animate-spin" />,
  sent: <Send className="h-3 w-3" />,
  delivered: <CheckCircle className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
}

export function SmsStatusBadge({
  status,
  showIcon = true,
  size = 'default',
}: SmsStatusBadgeProps) {
  const label = SMS_STATUS_LABELS[status] || status
  const color = SMS_STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'
  const icon = STATUS_ICONS[status]

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
export function SmsStatusIndicator({ status }: { status: SmsMessageStatus }) {
  if (status === 'failed') {
    return <span title="Fejlet"><XCircle className="h-4 w-4 text-red-500" /></span>
  }

  if (status === 'delivered') {
    return <span title="Leveret"><CheckCircle className="h-4 w-4 text-green-500" /></span>
  }

  if (status === 'sent') {
    return <span title="Sendt"><Send className="h-4 w-4 text-blue-500" /></span>
  }

  if (status === 'queued') {
    return <span title="I kø"><Loader2 className="h-4 w-4 text-yellow-500 animate-spin" /></span>
  }

  return <span title="Afventer"><Clock className="h-4 w-4 text-gray-400" /></span>
}
