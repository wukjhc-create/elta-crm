'use client'

/**
 * N69 — "Besvaret uden for CRM": tråden markeres som besvaret (svaret blev sendt fra fx en personlig postkasse, som
 * CRM ikke synker). En ny mail fra kunden i tråden gør den "kræver svar" igen.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'
import { markThreadAnsweredAction } from '@/lib/actions/incoming-emails'

export function MarkAnsweredButton({ emailId }: { emailId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  if (done) return <span className="inline-flex items-center gap-1 text-sm text-emerald-700" data-testid="mail-marked-answered"><CheckCheck className="w-4 h-4" /> Markeret som besvaret</span>
  return (
    <button
      type="button"
      disabled={busy}
      data-testid="mail-mark-answered"
      onClick={async () => {
        setBusy(true)
        const r = await markThreadAnsweredAction(emailId)
        setBusy(false)
        if (r.success) { setDone(true); router.refresh() }
      }}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      title="Svaret er sendt uden for CRM (fx fra din egen postkasse) — tråden fjernes fra 'Kræver svar'"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
      Besvaret uden for CRM
    </button>
  )
}
