'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { rejectOffer } from '@/lib/actions/portal'
import { RejectOfferForm } from '@/components/shared/reject-offer-form'
import type { OfferRejectionInput } from '@/types/offers.types'

interface RejectDialogProps {
  token: string
  offerId: string
  onClose: () => void
}

export function RejectDialog({ token, offerId, onClose }: RejectDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose()
    },
    [onClose, isSubmitting],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleSubmit = async (input: OfferRejectionInput) => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await rejectOffer(token, offerId, input)
      if (!result.success) {
        setError(result.error || 'Kunne ikke afvise tilbud')
        setIsSubmitting(false)
        return
      }
      router.refresh()
      onClose()
    } catch {
      setError('Der opstod en uventet fejl')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-dialog-title"
        className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 id="reject-dialog-title" className="text-xl font-bold">
            Afvis tilbud
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <RejectOfferForm
            onSubmit={handleSubmit}
            onCancel={onClose}
            isSubmitting={isSubmitting}
            error={error}
            variant="modal"
          />
        </div>
      </div>
    </div>
  )
}
