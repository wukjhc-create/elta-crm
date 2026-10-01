'use client'

/**
 * Lønsomhed (Profit Engine): realistisk DB inkl. firmaets timekost, kostdækning og advarsler.
 * Vises kun for roller med kostpris-adgang (offers.view.cost_prices — samme som showFinancials).
 */
import { useEffect, useState } from 'react'
import { TrendingUp, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { getOfferProfitAnalysis, type OfferProfitResult } from '@/lib/actions/profit'
import type { OfferLineItem } from '@/types/offers.types'

interface OfferProfitCardProps {
  offerId: string
  lineItems: OfferLineItem[]
  discountPercentage: number
}

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr`

const VERDICT: Record<OfferProfitResult['verdict'], { label: string; cls: string }> = {
  ok: { label: 'Sund lønsomhed', cls: 'bg-green-50 text-green-800 border-green-200' },
  under_maal: { label: 'Under mål-DB', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  under_minimum: { label: 'Under minimum-DB', cls: 'bg-red-50 text-red-800 border-red-200' },
  usikker: { label: 'Usikker — kostpriser mangler', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
}

const SOURCE: Record<string, string> = { known: 'kendt', estimated: 'estimeret', unknown: 'mangler' }

export function OfferProfitCard({ offerId, lineItems, discountPercentage }: OfferProfitCardProps) {
  const [data, setData] = useState<OfferProfitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  // Genberegn når linjer/rabat ændres (deterministisk nøgle)
  const key = `${discountPercentage}|${lineItems.map((l) => `${l.id}:${l.quantity}:${l.total}:${l.cost_price ?? ''}`).join(',')}`

  useEffect(() => {
    let alive = true
    setLoading(true)
    getOfferProfitAnalysis(offerId).then((r) => {
      if (!alive) return
      if (r.success && r.data) { setData(r.data); setError(null) } else setError(r.error ?? 'Kunne ikke beregne lønsomhed')
      setLoading(false)
    })
    return () => { alive = false }
  }, [offerId, key])

  if (loading && !data) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Beregner lønsomhed…</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="bg-white rounded-lg border p-6 text-sm text-muted-foreground">Lønsomhed: {error ?? 'ingen data'}</div>
    )
  }
  if (data.lines.length === 0) return null

  const v = VERDICT[data.verdict]
  return (
    <div className="bg-white rounded-lg border p-6" data-testid="offer-profit-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-medium"><TrendingUp className="w-4 h-4" /> Lønsomhed</div>
        <span className={`text-xs px-2 py-1 rounded border ${v.cls}`}>{v.label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
        <div><div className="text-muted-foreground">Salg efter rabat</div><div className="font-semibold">{kr(data.sale)}</div></div>
        <div><div className="text-muted-foreground">Realistisk DB</div><div className="font-semibold">{kr(data.dbRealistic)} · {data.dbRealisticPct} %</div></div>
        <div><div className="text-muted-foreground">DB (kun kendt kost)</div><div className="font-semibold">{data.dbKnownPct} %</div></div>
        <div><div className="text-muted-foreground">Kostdækning</div><div className="font-semibold">{data.costCoveragePct} %</div></div>
      </div>

      {data.warnings.length > 0 && (
        <ul className="space-y-1 mb-3">
          {data.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 text-sm text-amber-800"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{w}</li>
          ))}
        </ul>
      )}

      <div className="text-xs text-muted-foreground mb-2">
        Timekost: {data.hourlyCost != null ? `${data.hourlyCost} kr/t` : 'ikke sat'} ({data.hourlyCostSource})
        {data.minimumDbPct != null && ` · minimum-DB ${data.minimumDbPct} %`}{data.targetDbPct != null && ` · mål-DB ${data.targetDbPct} %`}
      </div>

      <button type="button" onClick={() => setExpanded((x) => !x)} className="text-sm text-blue-700 hover:underline flex items-center gap-1">
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} Linjer ({data.lines.length})
      </button>
      {expanded && (
        <table className="w-full text-sm mt-2">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Linje</th><th className="text-right">Salg</th><th className="text-right">Kost</th><th className="text-right">Kilde</th><th className="text-right">DB %</th></tr></thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="py-1">{l.description}{l.isLabour ? ' (timer)' : ''}</td>
                <td className="text-right">{kr(l.sale)}</td>
                <td className="text-right">{l.cost != null ? kr(l.cost) : '—'}</td>
                <td className={`text-right ${l.costSource === 'unknown' ? 'text-orange-700' : ''}`}>{SOURCE[l.costSource]}</td>
                <td className="text-right">{l.dbPct != null ? `${l.dbPct} %` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
