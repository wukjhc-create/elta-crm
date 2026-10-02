'use client'

/**
 * N23 — "Klar til lukning": vises på sagen for brugere med cases.close, når alle job er udført, intet er ufaktureret
 * og ingen timer kører. Lukning er et aktivt valg og går gennem samme status-handling (inkl. lukke-værnet, D23).
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { getCaseCloseReadinessAction, setServiceCaseStatus } from '@/lib/actions/service-cases'
import { isUnbilledCloseError, confirmCloseDespiteUnbilled } from '@/lib/cases/close-guard'
import type { CloseReadiness } from '@/lib/cases/case-progress'

export function CaseCloseReadiness({ caseId, status }: { caseId: string; status: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [r, setR] = useState<CloseReadiness | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (status === 'closed' || status === 'converted') { setR(null); return }
    getCaseCloseReadinessAction(caseId).then((res) => { if (alive) setR(res.success ? res.data ?? null : null) })
    return () => { alive = false }
  }, [caseId, status])

  if (!r?.ready) return null

  const close = async () => {
    setBusy(true); setError(null)
    let res = await setServiceCaseStatus(caseId, 'closed', null)
    if (!res.success && isUnbilledCloseError(res.error)) {
      if (!confirmCloseDespiteUnbilled(res.error)) { setBusy(false); return }
      res = await setServiceCaseStatus(caseId, 'closed', null, { acknowledgeUnbilled: true })
    }
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Kunne ikke lukke sagen'); return }
    startTransition(() => router.refresh())
  }

  return (
    <div className="mb-4 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 flex items-center gap-3" data-testid="case-ready-to-close">
      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
      <div className="flex-1 text-sm text-emerald-900">
        <span className="font-medium">Klar til lukning:</span> {r.reason} ({r.doneJobs} job udført).
        {error && <span className="block text-red-700 text-xs mt-0.5">{error}</span>}
      </div>
      <button
        type="button"
        onClick={close}
        disabled={busy}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        data-testid="case-close-now"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Luk sagen
      </button>
    </div>
  )
}
