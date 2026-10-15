'use client'

/**
 * N47: leverandørpriser ændret siden tilbudslinjen blev lavet — kun kladder og kostpris-roller. Viser ændring i %
 * (nettobeløb kun når kost/DB er foldet ud) og "Opdater" der henter ny kost + salgspris via marginreglen.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { getOfferSupplierPriceChanges, refreshLineItemPrice, type OfferSupplierPriceChange } from '@/lib/actions/offers'

const kr = (n: number) => new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export function OfferSupplierPriceChanges({ offerId, showAmounts }: { offerId: string; showAmounts: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState<OfferSupplierPriceChange[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tryKey, setTryKey] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoadError(null)
    getOfferSupplierPriceChanges(offerId).then((res) => {
      if (!alive) return
      if (res.success) {
        setRows(res.data ?? [])
        return
      }
      // Manglende kost-tilladelse er ikke en fejl i prislisten. Den bliver skjult som før.
      if (res.error?.includes('Manglende tilladelse')) {
        setRows([])
        return
      }
      setLoadError(res.error ?? 'Kunne ikke tjekke leverandørpriser')
    }).catch(() => {
      if (alive) setLoadError('Kunne ikke tjekke leverandørpriser')
    })
    return () => { alive = false }
  }, [offerId, tryKey])

  if (loadError && rows.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4" data-testid="offer-supplier-price-load-error">
        <p className="text-sm text-amber-900">{loadError}. Det tælles ikke som uændrede priser.</p>
        <button
          type="button"
          onClick={() => setTryKey((n) => n + 1)}
          className="mt-2 min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800"
        >
          Prøv igen
        </button>
      </div>
    )
  }

  if (!rows.length) return null

  const update = async (lineId: string) => {
    setBusy(lineId)
    setMsg(null)
    try {
      const res = await refreshLineItemPrice(lineId)
      if (!res.success) { setMsg(res.error ?? 'Kunne ikke opdatere'); return }
      setRows((r) => r.filter((x) => x.lineId !== lineId))
      router.refresh()
    } catch {
      setMsg('Kunne ikke opdatere. Prisen er ikke ændret.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-2" data-testid="offer-supplier-price-changes">
      <p className="text-sm font-medium text-amber-900 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {rows.length} linje{rows.length === 1 ? '' : 'r'} har ny leverandørpris siden tilbuddet blev lavet
      </p>
      <ul className="text-sm divide-y divide-amber-200">
        {rows.map((r) => (
          <li key={r.lineId} className="py-1.5 flex flex-wrap items-start justify-between gap-3">
            <span className="min-w-0 break-words">{r.description}</span>
            <span className="shrink-0 flex flex-wrap items-center gap-3">
              {showAmounts && <span className="tabular-nums text-xs text-gray-600">{kr(r.oldCost)} → {kr(r.newCost)}</span>}
              <span className={`tabular-nums text-xs font-medium ${r.deltaPct > 0 ? 'text-red-700' : 'text-emerald-700'}`} data-testid="supplier-price-delta">
                {r.deltaPct > 0 ? '+' : ''}{r.deltaPct.toLocaleString('da-DK')} %
              </span>
              <button
                type="button"
                onClick={() => void update(r.lineId)}
                disabled={busy === r.lineId}
                data-testid="supplier-price-refresh"
                className="inline-flex items-center gap-1 text-xs px-2 min-h-[44px] rounded border border-amber-400 bg-white hover:bg-amber-100 disabled:opacity-50"
              >
                {busy === r.lineId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Opdater pris
              </button>
            </span>
          </li>
        ))}
      </ul>
      {msg && <p className="text-xs text-red-700">{msg}</p>}
      <p className="text-[11px] text-amber-800">Opdatering henter ny kost og beregner salgsprisen med linjens avance. Sendte tilbud ændres ikke.</p>
    </div>
  )
}
