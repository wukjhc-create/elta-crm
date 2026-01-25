'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, XCircle } from 'lucide-react'
import { rejectOffer } from '@/lib/actions/portal'

interface RejectDialogProps {
  token: string
  offerId: string
  onClose: () => void
}

export function RejectDialog({ token, offerId, onClose }: RejectDialogProps) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await rejectOffer(token, offerId, reason || undefined)

      if (!result.success) {
        setError(result.error || 'Kunne ikke afvise tilbud')
        return
      }

      router.refresh()
      onClose()
    } catch (err) {
      setError('Der opstod en fejl')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">Afvis tilbud</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-gray-600">
            Er du sikker på at du vil afvise dette tilbud? Denne handling kan
            ikke fortrydes.
          </p>

          <div>
            <label className="block text-sm font-medium mb-1">
              Begrundelse (valgfrit)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Fortæl os gerne hvorfor du afviser tilbuddet..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium"
            disabled={isSubmitting}
          >
            Annuller
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
          >
            {isSubmitting ? (
              'Behandler...'
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                Afvis tilbud
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
