'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_COLORS,
  OFFER_STATUS_TRANSITIONS,
  type OfferStatus,
} from '@/types/offers.types'

interface OfferStatusBadgeProps {
  status: OfferStatus
  className?: string
  onStatusChange?: (newStatus: OfferStatus) => void
}

export function OfferStatusBadge({ status, className, onStatusChange }: OfferStatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false)
  const validTransitions = OFFER_STATUS_TRANSITIONS[status] || []
  const isInteractive = onStatusChange && validTransitions.length > 0

  if (!isInteractive) {
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

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-shadow',
          OFFER_STATUS_COLORS[status],
          className
        )}
      >
        {OFFER_STATUS_LABELS[status]}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1 w-36 bg-white border rounded-md shadow-lg z-20 py-1">
            {validTransitions.map((targetStatus) => (
              <button
                key={targetStatus}
                onClick={() => {
                  onStatusChange(targetStatus)
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
              >
                <span className={cn('w-2 h-2 rounded-full', OFFER_STATUS_COLORS[targetStatus].split(' ')[0])} />
                {OFFER_STATUS_LABELS[targetStatus]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
