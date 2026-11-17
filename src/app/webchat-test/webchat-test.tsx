'use client'

import { useState } from 'react'

type Msg = { from: 'visitor' | 'assistant' | 'system'; text: string }

const TOPICS: Array<{ key: string; label: string }> = [
  { key: 'general', label: 'Generelt spørgsmål' }, { key: 'service', label: 'Fejl / service' }, { key: 'quote', label: 'Tilbud' },
  { key: 'existing_case', label: 'Min sag' }, { key: 'human', label: 'Tal med en medarbejder' },
]

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random().toString(36).slice(2)}`)

export function WebChatTest({ needsKey }: { needsKey: boolean }) {
  const [token, setToken] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [topic, setTopic] = useState('general')
  const [visitor, setVisitor] = useState({ name: '', phone: '', email: '', postalCode: '', address: '' })
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function call(body: Record<string, unknown>) {
    const r = await fetch('/api/webchat', { method: 'POST', headers: { 'content-type': 'application/json', ...(needsKey ? { 'x-elta-webchat-key': key } : {}) }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    return { ok: r.ok, j: j as Record<string, unknown> }
  }

  async function start() {
    setBusy(true); setErr(null)
    const { ok, j } = await call({ op: 'start', topic, visitor })
    setBusy(false)
    if (!ok) { setErr(String(j.error ?? 'Chatten kunne ikke startes')); return }
    setToken(String(j.token)); setMsgs([{ from: 'assistant', text: String(j.greeting) }])
  }

  async function send() {
    const t = text.trim()
    if (!t || !token) return
    setBusy(true); setErr(null)
    setMsgs((m) => [...m, { from: 'visitor', text: t }]); setText('')
    const { ok, j } = await call({ op: 'message', token, text: t, clientMessageId: newId(), visitor })
    setBusy(false)
    if (!ok) { setErr(String(j.error ?? 'Beskeden kunne ikke sendes')); return }
    if (j.reply) setMsgs((m) => [...m, { from: 'assistant', text: String(j.reply) }, ...(j.handoff ? [{ from: 'system' as const, text: 'Givet videre til en medarbejder.' }] : [])])
  }

  if (!token) {
    return (
      <div className="space-y-3 text-sm" data-testid="webchat-start">
        {needsKey && <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Test-nøgle" className="w-full rounded border px-2 py-1" data-testid="webchat-key" />}
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTopic(t.key)} data-testid={`webchat-topic-${t.key}`}
              className={`rounded-full border px-3 py-1 ${topic === t.key ? 'border-blue-600 bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>{t.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={visitor.name} onChange={(e) => setVisitor({ ...visitor, name: e.target.value })} placeholder="Navn" className="rounded border px-2 py-1" data-testid="webchat-name" />
          <input value={visitor.phone} onChange={(e) => setVisitor({ ...visitor, phone: e.target.value })} placeholder="Telefon" className="rounded border px-2 py-1" data-testid="webchat-phone" />
          <input value={visitor.email} onChange={(e) => setVisitor({ ...visitor, email: e.target.value })} placeholder="E-mail" className="col-span-2 rounded border px-2 py-1" data-testid="webchat-email" />
          <input value={visitor.postalCode} onChange={(e) => setVisitor({ ...visitor, postalCode: e.target.value })} placeholder="Postnr. (valgfrit)" className="rounded border px-2 py-1" />
          <input value={visitor.address} onChange={(e) => setVisitor({ ...visitor, address: e.target.value })} placeholder="Adresse (valgfrit)" className="rounded border px-2 py-1" />
        </div>
        <button type="button" disabled={busy} onClick={start} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50" data-testid="webchat-begin">Start chat</button>
        {err && <p className="text-red-700" role="alert">{err}</p>}
      </div>
    )
  }
  return (
    <div className="space-y-3 text-sm" data-testid="webchat">
      <ul className="max-h-[60vh] space-y-2 overflow-auto rounded border bg-gray-50 p-3" data-testid="webchat-log">
        {msgs.map((m, i) => (
          <li key={i} data-testid={`webchat-msg-${m.from}`} className={m.from === 'visitor' ? 'text-right' : m.from === 'system' ? 'text-center text-xs text-gray-500' : ''}>
            <span className={`inline-block max-w-[85%] rounded-lg px-3 py-2 ${m.from === 'visitor' ? 'bg-blue-600 text-white' : m.from === 'system' ? '' : 'bg-white shadow-sm'}`}>{m.text}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Skriv din besked …" className="flex-1 rounded border px-2 py-1" data-testid="webchat-input" />
        <button type="submit" disabled={busy || !text.trim()} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" data-testid="webchat-send">Send</button>
      </form>
      {err && <p className="text-red-700" role="alert">{err}</p>}
    </div>
  )
}
