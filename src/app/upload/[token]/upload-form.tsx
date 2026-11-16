'use client'

import { useState } from 'react'
import { submitUploadLinkFiles } from '@/lib/actions/upload-links-public'

export function UploadForm({ token, remaining }: { token: string; remaining: number }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const r = await submitUploadLinkFiles(token, new FormData(e.currentTarget))
    setBusy(false)
    setMsg(r.success ? { ok: true, text: `Tak — ${r.accepted} fil(er) er modtaget.` } : { ok: false, text: r.error })
    if (r.success) e.currentTarget.reset()
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" data-testid="upload-input"
        className="block w-full text-sm" required />
      <button type="submit" disabled={busy || remaining <= 0} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" data-testid="upload-submit">
        {busy ? 'Uploader …' : 'Upload'}
      </button>
      {msg && <p role="status" className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
    </form>
  )
}
