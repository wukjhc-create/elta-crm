import { cn } from '@/lib/utils'
import {
  type OfferStatus,
  OFFER_STATUS_LABELS,
  OFFER_STATUS_COLORS,
} from '@/types/offers.types'

interface OfferStatusBadgeProps {
  status: OfferStatus
  className?: string
}

export function OfferStatusBadge({ status, className }: OfferStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        OFFER_STATUS_COLORS[status],
        className
      )}
    >
      {OFFER_STATUS_LABELS[status]}
    </span>
  )
}
