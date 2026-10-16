'use client'

/**
 * W-9 (pilot-review 2026-10-15) — midlertidig "Påmind mig" på leadet: henter en kalenderfil (.ics med alarm) til
 * sælgerens egen kalender. Intet gemmes i CRM'et: et rigtigt opfølgningsfelt på leads (next_follow_up_at) kræver en
 * migration og afventer Henrik ([H]); 00197 personal_reminders findes kun på staging.
 */
import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { generateFollowUpICS } from '@/lib/utils/ics'
import { copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

export function LeadFollowUpButton({ lead }: {
  lead: { id: string; company_name: string | null; contact_person: string | null; phone: string | null; email: string | null }
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => copenhagenDatePlusDays(1))
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const name = lead.company_name || lead.contact_person || 'lead'
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)

  const download = () => {
    if (!valid) return
    const url = typeof window !== 'undefined' ? `${window.location.origin}/dashboard/leads/${lead.id}` : ''
    const description = [
      note.trim(),
      lead.contact_person ? `Kontakt: ${lead.contact_person}` : '',
      lead.phone ? `Tlf: ${lead.phone}` : '',
      lead.email ? `E-mail: ${lead.email}` : '',
      url,
    ].filter(Boolean).join('\n')
    const ics = generateFollowUpICS({ id: `lead-${lead.id}-${date}${time.replace(':', '')}`, date, startTime: time, title: `Opfølgning: ${name}`, description })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `opfoelgning-${date}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50"
        data-testid="lead-follow-up"
      >
        <BellRing className="w-4 h-4" /> Påmind mig
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border bg-white p-3 shadow-lg space-y-2" data-testid="lead-follow-up-panel">
          <p className="text-xs text-gray-600">Lægger en påmindelse med alarm i din egen kalender (Outlook/Google/telefon).</p>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm" aria-label="Dato" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-24 border rounded px-2 py-1 text-sm" aria-label="Klokkeslæt" />
          </div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (valgfri)" className="w-full border rounded px-2 py-1 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1 text-sm border rounded">Annuller</button>
            <button type="button" onClick={download} disabled={!valid} className="px-3 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50" data-testid="lead-follow-up-download">
              Hent kalenderfil
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
