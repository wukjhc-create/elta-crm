'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmCallCustomer, rejectCallMatch } from '@/lib/actions/telephony-calls'

/**
 * Bekræft et kundeforslag eller afvis et forkert match. Kun via de eksisterende server-handlinger (calls.match, RLS,
 * optimistisk lås, audit). Ingen automatisk kobling; et ekstra tryk kræves.
 */
export function CallMatchActions(props: { callId: string; version: number; suggestion: { id: string; name: string } | null; confirmed: boolean; matchStatus: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [arm, setArm] = useState<'confirm' | 'reject' | null>(null)

  async function run(kind: 'confirm' | 'reject') {
    setBusy(true)
    setMsg(null)
    const res = kind === 'confirm' && props.suggestion
      ? await confirmCallCustomer(props.callId, props.suggestion.id, props.version)
      : await rejectCallMatch(props.callId, props.version)
    setBusy(false)
    setArm(null)
    if (res.success) router.refresh()
    else setMsg(res.error)
  }

  const canConfirm = !props.confirmed && props.suggestion !== null
  const canReject = props.confirmed || props.matchStatus === 'suggested'
  if (!canConfirm && !canReject) return null
  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      {arm === null && (
        <div className="flex gap-2">
          {canConfirm && <button type="button" disabled={busy} onClick={() => setArm('confirm')} className="rounded border px-2 py-1 hover:bg-gray-50">Bekræft {props.suggestion!.name}</button>}
          {canReject && <button type="button" disabled={busy} onClick={() => setArm('reject')} className="rounded border px-2 py-1 hover:bg-gray-50">Forkert kunde</button>}
        </div>
      )}
      {arm !== null && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => run(arm)} className="rounded bg-gray-900 px-2 py-1 text-white">
            {arm === 'confirm' ? 'Ja, kobl opkaldet til kunden' : 'Ja, fjern kunde/forslag'}
          </button>
          <button type="button" disabled={busy} onClick={() => setArm(null)} className="rounded border px-2 py-1">Fortryd</button>
        </div>
      )}
      {msg && <p className="text-red-700">{msg}</p>}
    </div>
  )
}
