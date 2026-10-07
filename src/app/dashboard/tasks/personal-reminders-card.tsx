'use client'

/**
 * Mine påmindelser — personlige påmindelser uden kunde (00197). Kun egne (RLS). Skjules hvor tabellen ikke findes.
 * Tider vises og indtastes i dansk tid.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, Check, Clock, Trash2 } from 'lucide-react'
import {
  completePersonalReminder,
  createPersonalReminder,
  deletePersonalReminder,
  getMyPersonalReminders,
  reschedulePersonalReminder,
  snoozePersonalReminder,
  type PersonalReminder,
} from '@/lib/actions/personal-reminders'
import { copenhagenLocalToIso, copenhagenParts, copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

const fmt = (iso: string) => {
  const p = copenhagenParts(iso)
  const [y, m, d] = p.date.split('-')
  return `${Number(d)}/${Number(m)}-${y} kl. ${p.clock}`
}
const SOURCE: Record<PersonalReminder['source'], string> = { manual: '', assistant: ' · via assistent', telegram: ' · via Telegram' }

export function PersonalRemindersCard() {
  const [state, setState] = useState<{ available: boolean; reminders: PersonalReminder[] } | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(copenhagenDatePlusDays(1))
  const [clock, setClock] = useState('09:00')
  const [editId, setEditId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editClock, setEditClock] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setState(await getMyPersonalReminders()) } catch { setState({ available: false, reminders: [] }) }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!state?.available) return null

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true)
    setError(null)
    const r = await fn()
    setBusy(false)
    if (!r.success) setError(r.error ?? 'Fejl')
    await load()
    return r.success
  }

  const pending = state.reminders.filter((r) => r.status === 'pending')
  const done = state.reminders.filter((r) => r.status === 'done')

  return (
    <div className="bg-white rounded-lg border p-6 mb-6" data-testid="personal-reminders">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><AlarmClock className="w-5 h-5 text-sky-600" />Mine påmindelser</h2>
      <p className="text-xs text-gray-500 mb-4">Kun synlige for dig.</p>
      <form
        className="flex flex-wrap items-end gap-2 mb-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => createPersonalReminder({ title, dueAt: copenhagenLocalToIso(date, clock) }))) setTitle('')
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Mind mig om…" aria-label="Påmindelse" className="flex-1 min-w-[12rem] rounded-md border px-3 py-1.5 text-sm" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Dato" className="rounded-md border px-2 py-1.5 text-sm" />
        <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} aria-label="Klokkeslæt" className="rounded-md border px-2 py-1.5 text-sm" />
        <button type="submit" disabled={busy || !title.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Tilføj</button>
      </form>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {pending.length === 0 ? <p className="text-sm text-gray-500">Ingen aktive påmindelser.</p> : (
        <ul className="divide-y">
          {pending.map((r) => (
            <li key={r.id} className="py-2" data-testid="personal-reminder-row">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500">{fmt(r.due_at)}{r.reminder_at && r.reminder_at !== r.due_at ? ` · påmindelse ${fmt(r.reminder_at)}` : ''}{SOURCE[r.source]}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button title="Udført" aria-label="Udført" onClick={() => run(() => completePersonalReminder(r.id))} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                  <button title="Udsæt 1 time" aria-label="Udsæt" onClick={() => run(() => snoozePersonalReminder(r.id))} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"><Clock className="w-4 h-4" /></button>
                  <button title="Ret tidspunkt" aria-label="Ret tidspunkt" onClick={() => { const p = copenhagenParts(r.due_at); setEditId(r.id); setEditDate(p.date); setEditClock(p.clock) }} className="px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 rounded">Ret</button>
                  <button title="Slet" aria-label="Slet påmindelse" onClick={() => run(() => deletePersonalReminder(r.id))} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {editId === r.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} aria-label="Ny dato" className="rounded-md border px-2 py-1 text-sm" />
                  <input type="time" value={editClock} onChange={(e) => setEditClock(e.target.value)} aria-label="Nyt klokkeslæt" className="rounded-md border px-2 py-1 text-sm" />
                  <button onClick={async () => { if (await run(() => reschedulePersonalReminder(r.id, copenhagenLocalToIso(editDate, editClock)))) setEditId(null) }} className="rounded-md bg-sky-600 px-2 py-1 text-xs text-white">Gem tidspunkt</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-gray-500">Annullér</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && <p className="mt-3 text-xs text-gray-400">{done.length} udført de seneste 7 dage</p>}
    </div>
  )
}
