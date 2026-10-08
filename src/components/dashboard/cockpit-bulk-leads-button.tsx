'use client'

/**
 * N86 — "Opret leads for alle (N)" på cockpittets webhenvendelser. Bekræftelse først; henvendelser uden læsbar
 * e-mail springes over (og tælles). Samme action pr. mail som "Opret lead".
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus } from 'lucide-react'
import { createLeadsForOpenWebInquiriesAction } from '@/lib/actions/incoming-emails'

export function CockpitBulkLeadsButton({ count }: { count: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2 mb-1">
      <button
        type="button"
        disabled={busy}
        data-testid="cockpit-bulk-leads"
        onClick={async () => {
          if (!window.confirm(`Opret leads for ${count} henvendelse(r) fra hjemmesiden? Personer der allerede er kunder (samme e-mail) kobles til kunden; henvendelser uden læsbar e-mail springes over.`)) return
          setBusy(true); setMsg(null)
          const r = await createLeadsForOpenWebInquiriesAction()
          setBusy(false)
          setMsg(r.success ? `${r.created} lead(s) oprettet${r.linked ? ` · ${r.linked} koblet til eksisterende kunde` : ''}${r.skipped ? ` · ${r.skipped} sprunget over` : ''}` : (r.error ?? 'Fejl'))
          router.refresh()
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
        Opret leads for alle ({count})
      </button>
      {msg && <span className="text-[11px] text-gray-600" data-testid="cockpit-bulk-leads-result">{msg}</span>}
    </div>
  )
}
