'use client'

/**
 * N67b — ét klik fra cockpittets "Henvendelser fra hjemmesiden": opret lead fra webhenvendelsen (kontaktdata læses fra
 * formularen; dublet-værn på mailen — samme action som mailens "Opret lead") og åbn leadet.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus } from 'lucide-react'
import { createLeadFromEmailAction } from '@/lib/actions/incoming-emails'

export function CockpitCreateLeadButton({ emailId }: { emailId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="shrink-0 flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null)
          const r = await createLeadFromEmailAction(emailId)
          setBusy(false)
          if (!r.success || !r.data) { setError(r.error ?? 'Kunne ikke oprette lead'); return }
          router.push(`/dashboard/leads/${r.data.leadId}`)
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        data-testid="cockpit-create-lead"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
        Opret lead
      </button>
      {error && <span className="text-[10px] text-red-700 max-w-[160px] text-right" data-testid="cockpit-create-lead-error">{error}</span>}
    </span>
  )
}
