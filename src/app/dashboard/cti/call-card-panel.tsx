'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createCustomerTask } from '@/lib/actions/customer-tasks'
import { createCustomerNote } from '@/lib/actions/customer-notes'
import type { CallCard } from '@/lib/integrations/telephony/call-card'

/**
 * Handlinger på opkaldskortet. Ring op og SMS er altid deaktiveret.
 * Tilbageringning og note skrives først efter et ekstra tryk, via de eksisterende handlinger.
 */
export function CallCardPanel({ card }: { card: CallCard }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState<'callback' | 'note' | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveCallback() {
    if (!card.customerId || !card.displayNumber) return
    setBusy(true)
    setMessage(null)
    const openCase = card.openCases.find((c) => c.customer_id === card.customerId)
    const res = await createCustomerTask({
      customer_id: card.customerId,
      title: `Ring tilbage: ${card.customerLabel ?? 'kunde'}`,
      description: `Opkaldskort ${card.displayNumber}.${openCase ? ` Åben sag: ${openCase.case_number ?? ''} ${openCase.title}`.trim() : ''}`,
      priority: 'high',
      due_date: new Date().toISOString(),
      reminder_at: new Date().toISOString(),
      service_case_id: openCase?.id,
    })
    setBusy(false)
    setConfirm(null)
    setMessage(res.success ? 'Tilbageringningen er oprettet.' : (res.error ?? 'Opgaven kunne ikke oprettes.'))
    if (res.success) router.refresh()
  }

  async function saveNote() {
    if (!card.customerId) return
    const text = note.trim()
    if (!text) {
      setMessage('Noten er tom.')
      return
    }
    setBusy(true)
    setMessage(null)
    const res = await createCustomerNote(card.customerId, `Opkaldsnote: ${text}`)
    setBusy(false)
    if (res.success) {
      setNote('')
      setConfirm(null)
      setMessage('Noten er gemt på kunden.')
      router.refresh()
    } else {
      setMessage(res.error ?? 'Noten kunne ikke gemmes.')
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-4">
        <p className="text-sm text-gray-700">{card.reason}</p>
        {card.matchStatus === 'ambiguous' && (
          <ul className="mt-3 divide-y border-t">
            {card.matches.map((m) => (
              <li key={`${m.kind}-${m.id}`} className="flex items-center justify-between py-2 text-sm">
                <span>{m.label} · {m.kind === 'customer' ? 'Kunde' : m.kind === 'contact' ? 'Kontakt' : 'Lead'}</span>
                <Link className="text-blue-700 hover:underline" href={m.kind === 'lead' ? `/dashboard/leads/${m.id}` : `/dashboard/customers/${m.customer_id}`}>
                  Vælg
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {card.actions.map((action) => {
          if (action.href && action.enabled) {
            return (
              <Link key={action.id} href={action.href} className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium text-blue-700">
                {action.label}
              </Link>
            )
          }
          if (action.id === 'create_callback' && action.enabled) {
            return (
              <button key={action.id} type="button" className="inline-flex min-h-11 items-center rounded-md bg-green-700 px-3 text-sm font-medium text-white" onClick={() => { setConfirm('callback'); setMessage(null) }}>
                {action.label}
              </button>
            )
          }
          if (action.id === 'add_note' && action.enabled) {
            return (
              <button key={action.id} type="button" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium" onClick={() => { setConfirm('note'); setMessage(null) }}>
                {action.label}
              </button>
            )
          }
          return (
            <button key={action.id} type="button" disabled className="inline-flex min-h-11 items-center rounded-md border border-dashed px-3 text-sm text-gray-500" title={action.blockedReason ?? undefined}>
              {action.label}
            </button>
          )
        })}
      </div>
      {card.actions.some((a) => a.blockedReason) && (
        <ul className="text-xs text-gray-500 space-y-1">
          {card.actions.filter((a) => a.blockedReason).map((a) => (
            <li key={a.id}>{a.label}: {a.blockedReason}</li>
          ))}
        </ul>
      )}

      {confirm === 'callback' && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p>Opret opgaven “Ring tilbage: {card.customerLabel}” på kunden. Der ringes ikke op.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={saveCallback} className="min-h-11 rounded-md bg-green-700 px-3 text-white disabled:opacity-50">Bekræft</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="min-h-11 rounded-md border px-3">Annuller</button>
          </div>
        </section>
      )}

      {confirm === 'note' && (
        <section className="rounded-lg border bg-white p-4">
          <label className="block text-sm font-medium" htmlFor="call-note">Opkaldsnote</label>
          <textarea id="call-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full rounded-md border p-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={saveNote} className="min-h-11 rounded-md bg-gray-900 px-3 text-sm text-white disabled:opacity-50">Gem note</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="min-h-11 rounded-md border px-3 text-sm">Annuller</button>
          </div>
        </section>
      )}

      {message && <p className="text-sm text-gray-800">{message}</p>}
    </div>
  )
}
