'use client'

import { useState, useEffect } from 'react'
import {
  CalendarCheck,
  CheckCircle,
  Clock,
  Loader2,
  MessageSquareText,
  Send,
  X,
} from 'lucide-react'
import {
  getPortalBesigtigelser,
  portalConfirmBesigtigelse,
  portalRequestReschedule,
} from '@/lib/actions/portal'
import type { PortalBesigtigelse } from '@/lib/actions/portal'

interface PortalBesigtigelseSectionProps {
  token: string
  customerName: string
}

function extractTimeFromDescription(desc: string | null): string | null {
  if (!desc) return null
  const match = desc.match(/Tidspunkt:\s*(.+)/i) || desc.match(/kl\.\s*(\S+)/)
  return match ? match[1].trim() : null
}

export function PortalBesigtigelseSection({ token, customerName }: PortalBesigtigelseSectionProps) {
  const [bookings, setBookings] = useState<PortalBesigtigelse[]>([])
  const [loading, setLoading] = useState(true)

  const loadBookings = () => {
    getPortalBesigtigelser(token).then((res) => {
      if (res.success && res.data) setBookings(res.data)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadBookings()
  }, [token])

  // Find next upcoming besigtigelse (not done)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = bookings
    .filter((b) => b.status !== 'done' && b.due_date && b.due_date >= today)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))

  const past = bookings.filter(
    (b) => b.status === 'done' || (b.due_date && b.due_date < today)
  )

  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Besigtigelse</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Besigtigelse</h2>
          </div>
        </div>
        <div className="p-6 text-center py-8 text-gray-500">
          <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Ingen besigtigelser planlagt</p>
          <p className="text-xs text-gray-400 mt-1">
            Når vi planlægger en besigtigelse, kan du se og bekræfte den her
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Besigtigelse</h2>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Upcoming — actionable */}
        {upcoming.map((b) => (
          <BesigtigelseCard
            key={b.id}
            booking={b}
            token={token}
            onUpdated={loadBookings}
          />
        ))}

        {/* Past / completed */}
        {past.map((b) => {
          const formattedDate = b.due_date
            ? new Date(b.due_date).toLocaleDateString('da-DK', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : null

          return (
            <div
              key={b.id}
              className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg opacity-70"
            >
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600">
                  Besigtigelse gennemført{formattedDate ? ` d. ${formattedDate}` : ''}
                </p>
              </div>
              <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                Gennemført
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =====================================================
// Single Besigtigelse Card with actions
// =====================================================

function BesigtigelseCard({
  booking,
  token,
  onUpdated,
}: {
  booking: PortalBesigtigelse
  token: string
  onUpdated: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleMsg, setRescheduleMsg] = useState('')
  const [sendingReschedule, setSendingReschedule] = useState(false)
  const [rescheduleSent, setRescheduleSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formattedDate = booking.due_date
    ? new Date(booking.due_date).toLocaleDateString('da-DK', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const timeSlot = extractTimeFromDescription(booking.description)

  // Already confirmed (in_progress)
  const isConfirmed = booking.status === 'in_progress' || confirmed

  const handleConfirm = async () => {
    setConfirming(true)
    setError(null)
    try {
      const result = await portalConfirmBesigtigelse(token, booking.id)
      if (result.success) {
        setConfirmed(true)
        onUpdated()
      } else {
        setError(result.error || 'Kunne ikke bekræfte')
      }
    } catch {
      setError('Uventet fejl')
    } finally {
      setConfirming(false)
    }
  }

  const handleReschedule = async () => {
    if (!rescheduleMsg.trim()) return
    setSendingReschedule(true)
    setError(null)
    try {
      const result = await portalRequestReschedule(token, booking.id, rescheduleMsg.trim())
      if (result.success) {
        setRescheduleSent(true)
        setShowReschedule(false)
      } else {
        setError(result.error || 'Kunne ikke sende anmodning')
      }
    } catch {
      setError('Uventet fejl')
    } finally {
      setSendingReschedule(false)
    }
  }

  // Confirmed state
  if (isConfirmed) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-900">Besigtigelse bekræftet</p>
            {formattedDate && (
              <p className="text-sm text-green-700">Vi ses d. {formattedDate}</p>
            )}
          </div>
        </div>
        {timeSlot && (
          <p className="text-sm text-green-700 ml-[52px]">
            <Clock className="w-3.5 h-3.5 inline mr-1" />
            {timeSlot}
          </p>
        )}
      </div>
    )
  }

  // Reschedule sent
  if (rescheduleSent) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <MessageSquareText className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">Flytning anmodet</p>
            <p className="text-sm text-amber-700">
              Vi har modtaget din besked og vender tilbage hurtigst muligt.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Pending — needs action
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-5 space-y-4">
      {/* Info */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
          <CalendarCheck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Besigtigelse foreslået</p>
          {formattedDate && (
            <p className="text-sm text-blue-800 font-medium mt-0.5">{formattedDate}</p>
          )}
          {timeSlot && (
            <p className="text-sm text-blue-700 mt-0.5">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              {timeSlot}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 ml-[52px]">
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold transition-colors shadow-sm"
        >
          {confirming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Bekræft tidspunkt
        </button>
        <button
          onClick={() => setShowReschedule(!showReschedule)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-semibold transition-colors shadow-sm"
        >
          <MessageSquareText className="w-4 h-4" />
          Anmod om at flytte tiden
        </button>
      </div>

      {/* Reschedule form */}
      {showReschedule && (
        <div className="ml-[52px] space-y-3">
          <textarea
            value={rescheduleMsg}
            onChange={(e) => setRescheduleMsg(e.target.value)}
            placeholder="Beskriv venligst hvornår der passer bedre, eller hvad du gerne vil ændre..."
            rows={3}
            autoFocus
            className="w-full px-3 py-2.5 border border-amber-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleReschedule}
              disabled={sendingReschedule || !rescheduleMsg.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {sendingReschedule ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send besked
            </button>
            <button
              onClick={() => {
                setShowReschedule(false)
                setRescheduleMsg('')
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuller
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="ml-[52px] bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
