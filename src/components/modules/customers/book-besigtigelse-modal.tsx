'use client'

import { useState } from 'react'
import { X, CalendarCheck, Loader2 } from 'lucide-react'
import { bookBesigtigelse } from '@/lib/actions/customer-tasks'
import { useToast } from '@/components/ui/toast'

interface BookBesigtigelseModalProps {
  customerId: string
  customerName: string
  customerEmail: string
  onClose: () => void
  onSuccess: () => void
}

export function BookBesigtigelseModal({
  customerId,
  customerName,
  customerEmail,
  onClose,
  onSuccess,
}: BookBesigtigelseModalProps) {
  const toast = useToast()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) {
      toast.error('Vælg en dato')
      return
    }

    setIsSaving(true)
    try {
      const result = await bookBesigtigelse(
        customerId,
        customerName,
        customerEmail,
        date,
        time,
        notes || undefined
      )
      if (result.success) {
        toast.success('Besigtigelse booket', `Email sendt til ${customerEmail}`)
        onSuccess()
        onClose()
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke booke besigtigelse')
      }
    } catch {
      toast.error('Fejl', 'Uventet fejl')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <CalendarCheck className="w-5 h-5" />
            <h3 className="text-lg font-bold">Book Besigtigelse</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-sm text-blue-700">
            Besigtigelse hos <strong>{customerName}</strong>
            <br />
            <span className="text-xs">Bekræftelses-email sendes til {customerEmail}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dato *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min={new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tidspunkt *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Noter (valgfrit)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fx: Husk at medbringe stiger, kunden har hund..."
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-md hover:bg-gray-50"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shadow-sm hover:shadow-md transition-all"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
              Book & Send email
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
