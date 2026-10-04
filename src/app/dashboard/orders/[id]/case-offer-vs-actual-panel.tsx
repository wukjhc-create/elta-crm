'use client'

/**
 * N26c — efterkalkulation pr. linje (tilbudt vs. faktisk) på Økonomi-fanen. Sammenfoldet som standard og henter
 * først data når den foldes ud (shoulder-surfing); foldes sammen igen når vinduet/fanen skjules.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ListChecks, Loader2 } from 'lucide-react'
import { getCaseOfferVsActual, type CaseOfferVsActual } from '@/lib/actions/case-offer-vs-actual'
import { useCostReveal } from '@/components/shared/sensitive-amounts'
import { formatCurrency } from '@/lib/utils/format'
import type { OfferVsActualStatus } from '@/lib/cases/offer-vs-actual'

const STATUS: Record<OfferVsActualStatus, { label: string; cls: string }> = {
  as_offered: { label: 'Som tilbudt', cls: 'bg-emerald-100 text-emerald-800' },
  over: { label: 'Over', cls: 'bg-red-100 text-red-800' },
  under: { label: 'Under', cls: 'bg-blue-100 text-blue-800' },
  not_used: { label: 'Ikke brugt', cls: 'bg-gray-100 text-gray-700' },
  not_offered: { label: 'Ikke tilbudt', cls: 'bg-amber-100 text-amber-800' },
}

const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))
const qty = (n: number | null) => (n == null ? '—' : n.toLocaleString('da-DK', { maximumFractionDigits: 2 }))

export function CaseOfferVsActualPanel({ caseId }: { caseId: string }) {
  const [open, toggle] = useCostReveal()
  const [data, setData] = useState<CaseOfferVsActual | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setError(null)
    getCaseOfferVsActual(caseId).then((res) => {
      if (!alive) return
      if (res.success && res.data) setData(res.data)
      else setError(res.error ?? 'Kunne ikke hente efterkalkulation')
    })
    return () => { alive = false }
  }, [open, caseId])

  // data ryddes når panelet foldes sammen — intet bliver liggende i DOM'en
  useEffect(() => { if (!open) setData(null) }, [open])

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4" data-testid="offer-vs-actual-panel">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left" data-testid="offer-vs-actual-toggle" aria-expanded={open}>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-gray-500" />
          Tilbudt vs. faktisk pr. linje
        </h3>
        {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="mt-3">
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!error && !data && (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</p>
          )}
          {data && (
            <>
              <p className="text-xs text-gray-500 mb-2">
                {data.offer
                  ? `Tilbud ${data.offer.offer_number ?? ''} mod sagens registrerede materialer og timer. Timekost er samlet for sagen.`
                  : 'Sagen er ikke oprettet fra et tilbud — viser kun faktisk forbrug.'}
              </p>
              {data.rows.length === 0 ? (
                <p className="text-sm text-gray-500">Ingen linjer eller forbrug endnu.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Linje</th>
                        <th className="px-2 py-1.5 text-right">Tilbudt antal</th>
                        <th className="px-2 py-1.5 text-right">Faktisk antal</th>
                        <th className="px-2 py-1.5 text-right">Tilbudt kost</th>
                        <th className="px-2 py-1.5 text-right">Faktisk kost</th>
                        <th className="px-2 py-1.5 text-right">Afvigelse</th>
                        <th className="px-2 py-1.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.rows.map((r) => (
                        <tr key={r.key} data-testid="offer-vs-actual-row" data-status={r.status}>
                          <td className="px-2 py-1.5">
                            <div className="text-gray-900">{r.description}</div>
                            {r.unit && <div className="text-[11px] text-gray-500">{r.unit}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{qty(r.offered_qty)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{qty(r.actual_qty)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{kr(r.offered_cost)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{kr(r.actual_cost)}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${r.cost_deviation != null && r.cost_deviation > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                            {r.cost_deviation == null ? '—' : `${r.cost_deviation > 0 ? '+' : ''}${kr(r.cost_deviation)}`}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-gray-600" colSpan={3}>I alt</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{kr(data.totals.offered_cost)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{kr(data.totals.actual_cost)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${data.totals.deviation > 0 ? 'text-red-700' : 'text-emerald-700'}`} data-testid="offer-vs-actual-deviation">
                          {`${data.totals.deviation > 0 ? '+' : ''}${kr(data.totals.deviation)}`}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
