'use client'

/**
 * N31 — kunden booker selv en besigtigelse i portalen. Opretter en CRM-opgave til kontoret; bekræftelsesmail til
 * kunden er gated (PORTAL_BOOKING_CONFIRMATION_EMAIL_ENABLED) — kunden ser bookingen i portalen med det samme.
 */

import { useState } from 'react'
import { CalendarPlus, Loader2, CheckCircle } from 'lucide-react'
import { portalBookBesigtigelse } from '@/lib/actions/portal'

const SLOTS = ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00']

function todayKey(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date())
}

export function PortalBookBesigtigelse({ token, onBooked }: { token: string; onBooked: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState(SLOTS[0])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2" data-testid="portal-booking-done">
        <CheckCircle className="w-4 h-4" /> Tak — vi har modtaget din anmodning og bekræfter tidspunktet hurtigst muligt.
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        data-testid="portal-book-open"
      >
        <CalendarPlus className="w-4 h-4" /> Book en besigtigelse
      </button>
    )
  }

  const submit = async () => {
    setError(null)
    if (!date) { setError('Vælg en dato'); return }
    setBusy(true)
    const r = await portalBookBesigtigelse(token, date, slot, notes || undefined)
    setBusy(false)
    if (!r.success) { setError(r.error ?? 'Kunne ikke booke'); return }
    setDone(true)
    onBooked()
  }

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="portal-book-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-gray-700 mb-1">Ønsket dato</span>
          <input type="date" min={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded px-2 py-1.5" data-testid="portal-book-date" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-700 mb-1">Tidsrum</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full border rounded px-2 py-1.5" data-testid="portal-book-slot">
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="text-sm block">
        <span className="block text-gray-700 mb-1">Besked (valgfri)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className="w-full border rounded px-2 py-1.5" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" data-testid="portal-book-submit">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send anmodning
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-lg border">Annuller</button>
      </div>
    </div>
  )
}
