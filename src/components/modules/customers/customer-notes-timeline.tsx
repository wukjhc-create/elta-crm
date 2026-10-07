'use client'

/**
 * T6 — kundens tidsstemplede noter (customer_notes). Supplerer kundens fritekstfelt "Noter" (som aldrig overskrives).
 * Skjules helt, hvor tabellen ikke findes endnu (available=false).
 */
import { useCallback, useEffect, useState } from 'react'
import { StickyNote, Trash2 } from 'lucide-react'
import { createCustomerNote, deleteCustomerNote, getCustomerNotes, type CustomerNote } from '@/lib/actions/customer-notes'

const SOURCE_LABEL: Record<CustomerNote['source'], string> = { manual: '', assistant: 'via assistent', telegram: 'via Telegram', system: 'system' }

export function CustomerNotesTimeline({ customerId }: { customerId: string }) {
  const [state, setState] = useState<{ available: boolean; notes: CustomerNote[]; canWrite: boolean } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setState(await getCustomerNotes(customerId))
    } catch {
      setState({ available: false, notes: [], canWrite: false })
    }
  }, [customerId])

  useEffect(() => { void load() }, [load])

  if (!state?.available) return null

  const add = async () => {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    const r = await createCustomerNote(customerId, text)
    setBusy(false)
    if (r.success) { setText(''); await load() } else setError(r.error ?? 'Fejl')
  }
  const remove = async (id: string) => {
    const r = await deleteCustomerNote(id)
    if (r.success) await load(); else setError(r.error ?? 'Fejl')
  }

  return (
    <div className="bg-white rounded-lg border p-6" data-testid="customer-notes-timeline">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><StickyNote className="w-5 h-5 text-amber-500" />Notelog</h2>
      {state.canWrite && (
        <div className="mb-4 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={5000}
            rows={2}
            placeholder="Skriv en note…"
            aria-label="Ny kundenote"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <button onClick={add} disabled={busy || !text.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Tilføj note
          </button>
        </div>
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {state.notes.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen noter endnu.</p>
      ) : (
        <ul className="space-y-3">
          {state.notes.map((n) => (
            <li key={n.id} className="border-l-2 border-amber-300 pl-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</p>
                {n.canDelete && (
                  <button onClick={() => remove(n.id)} title="Slet note" aria-label="Slet note" className="shrink-0 p-1 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {new Date(n.created_at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' })}
                {n.author ? ` · ${n.author}` : ''}
                {SOURCE_LABEL[n.source] ? ` · ${SOURCE_LABEL[n.source]}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
