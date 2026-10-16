'use client'

/**
 * X-11 (Henrik 2026-10-16): fælles opfølgning på leadet — dato/tid (dansk), note; vises med status (planlagt / i dag /
 * forfalden). Kun med leads.edit kan den sættes/ryddes. Vises kun når LEAD_FOLLOW_UP_ENABLED er sat (00233 kørt).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { setLeadFollowUpAction } from '@/lib/actions/leads'
import { followUpState, FOLLOW_UP_LABEL } from '@/lib/leads/follow-up'
import { copenhagenParts, copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'
import { humanizeErrorText } from '@/lib/auth/permission-text'

export function LeadFollowUpPanel({ lead, canEdit }: {
  lead: { id: string; status: string; follow_up_at?: string | null; follow_up_note?: string | null }
  canEdit: boolean
}) {
  const router = useRouter()
  const current = lead.follow_up_at ? copenhagenParts(lead.follow_up_at) : null
  const [date, setDate] = useState(current?.date ?? copenhagenDatePlusDays(1))
  const [clock, setClock] = useState(current?.clock ?? '09:00')
  const [note, setNote] = useState(lead.follow_up_note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = followUpState(lead)

  const save = async (clear = false) => {
    setBusy(true)
    setError(null)
    const r = await setLeadFollowUpAction(lead.id, clear ? null : { date, clock, note })
    setBusy(false)
    if (!r.success) { setError(humanizeErrorText(r.error) ?? 'Kunne ikke gemme'); return }
    router.refresh()
  }

  const tone = state === 'overdue' ? 'bg-red-50 text-red-800 ring-red-200' : state === 'today' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-gray-50 text-gray-700 ring-gray-200'
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3" data-testid="lead-follow-up-panel-shared">
      <h3 className="font-semibold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Opfølgning</h3>
      {state !== 'none' && current && (
        <p className={`text-sm rounded px-2 py-1 ring-1 ${tone}`} data-testid="lead-follow-up-state">
          {FOLLOW_UP_LABEL[state]}: {current.date.split('-').reverse().join('.')} kl. {current.clock}
          {lead.follow_up_note ? ` — ${lead.follow_up_note}` : ''}
        </p>
      )}
      {canEdit ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm" aria-label="Opfølgningsdato" />
            <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} className="w-24 border rounded px-2 py-1 text-sm" aria-label="Klokkeslæt" />
          </div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Hvad skal der følges op på?" className="w-full border rounded px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={() => save(false)} disabled={busy} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50" data-testid="lead-follow-up-save">
              {lead.follow_up_at ? 'Opdatér opfølgning' : 'Sæt opfølgning'}
            </button>
            {lead.follow_up_at && (
              <button type="button" onClick={() => save(true)} disabled={busy} className="px-3 py-1.5 text-sm rounded border disabled:opacity-50" data-testid="lead-follow-up-clear">
                Fjern
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </div>
      ) : state === 'none' ? (
        <p className="text-sm text-gray-500">Ingen opfølgning sat.</p>
      ) : null}
    </div>
  )
}
