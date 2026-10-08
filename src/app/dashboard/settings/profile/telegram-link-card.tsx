'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { createTelegramLinkCodeAction, revokeTelegramLinkAction, type TelegramLinkStatus } from '@/lib/actions/assistant'

/** "Forbind Telegram" (ELTA Assistant). Vises kun for roller der må bruge assistenten. */
export function TelegramLinkCard({ status }: { status: TelegramLinkStatus }) {
  const [linked, setLinked] = useState(status.linked)
  const [code, setCode] = useState<string | null>(null)
  const [ttl, setTtl] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!status.allowed) return null

  const makeCode = async () => {
    setBusy(true)
    setError(null)
    const r = await createTelegramLinkCodeAction()
    setBusy(false)
    if (r.success && r.code) { setCode(r.code); setTtl(r.ttlMin ?? null) } else setError(r.error ?? 'Fejl')
  }
  const revoke = async () => {
    setBusy(true)
    const r = await revokeTelegramLinkAction()
    setBusy(false)
    if (r.success) { setLinked(false); setCode(null) } else setError(r.error ?? 'Fejl')
  }

  return (
    <div className="bg-white rounded-lg border p-6 space-y-3" data-testid="telegram-link-card">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-sky-600" />
        <h2 className="text-lg font-semibold text-gray-900">ELTA Assistant (Telegram)</h2>
      </div>
      <p className="text-sm text-gray-600">
        Opret opkald, påmindelser og aftaler fra Telegram — alt gemmes i CRM.
      </p>
      {linked ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-green-700">Forbundet{status.linkedAt ? ` siden ${new Date(status.linkedAt).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })}` : ''}</span>
          <button onClick={revoke} disabled={busy} className="text-sm text-red-600 hover:underline disabled:opacity-50">Afbryd forbindelse</button>
        </div>
      ) : code ? (
        <div className="rounded-md bg-sky-50 p-3 text-sm">
          Send <span className="font-mono font-semibold">/start {code}</span> til ELTA-botten i Telegram
          {ttl ? ` inden for ${ttl} minutter` : ''}.
        </div>
      ) : (
        <button onClick={makeCode} disabled={busy} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          Forbind Telegram
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
