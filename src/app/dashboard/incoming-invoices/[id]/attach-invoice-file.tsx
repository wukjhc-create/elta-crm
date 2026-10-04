'use client'

/**
 * Vedhæft bilag (PDF/billede) til en leverandørfaktura der kun har mailteksten — fx når vedhæftningen ikke blev hentet
 * automatisk. Fakturaen læses igen bagefter. Serveren håndhæver rettighed (incoming_invoices.edit) og låste statusser.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Loader2 } from 'lucide-react'
import { attachIncomingInvoiceFileAction } from '@/lib/actions/incoming-invoices'

export function AttachInvoiceFile({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await attachIncomingInvoiceFileAction(invoiceId, fd)
    setBusy(false)
    setMsg({ ok: res.ok, text: res.message })
    if (input.current) input.current.value = ''
    if (res.ok) router.refresh()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        data-testid="invoice-attach-input"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        data-testid="invoice-attach-file"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
        Vedhæft PDF fra mailen
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} data-testid="invoice-attach-result">{msg.text}</span>
      )}
    </div>
  )
}
