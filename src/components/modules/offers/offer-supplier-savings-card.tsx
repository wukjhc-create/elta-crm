'use client'

/**
 * Grossist-sammenligning på tilbuddet: samme vare (EAN) er billigere hos en anden leverandør.
 * Kun roller med kostpris-adgang; vises kun når der findes en reel besparelse. Ingen handling — kun information.
 */
import { useEffect, useState } from 'react'
import { ArrowDownCircle } from 'lucide-react'
import { getCheaperAlternativesForOffer } from '@/lib/actions/profit'
import type { CheaperAlternative } from '@/lib/pricing/supplier-compare'
import type { OfferLineItem } from '@/types/offers.types'

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`

export function OfferSupplierSavingsCard({ offerId, lineItems }: { offerId: string; lineItems: OfferLineItem[] }) {
  const [alts, setAlts] = useState<CheaperAlternative[] | null>(null)
  const key = lineItems.map((l) => `${l.id}:${l.quantity}:${l.supplier_product_id ?? ''}`).join(',')

  useEffect(() => {
    let alive = true
    getCheaperAlternativesForOffer(offerId).then((r) => { if (alive) setAlts(r.success && r.data ? r.data : []) })
    return () => { alive = false }
  }, [offerId, key])

  if (!alts || alts.length === 0) return null
  const total = alts.reduce((s, a) => s + a.savingTotal, 0)

  return (
    <div className="bg-white rounded-lg border p-6" data-testid="offer-supplier-savings-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-medium"><ArrowDownCircle className="w-4 h-4 text-green-700" /> Billigere hos anden grossist</div>
        <span className="text-xs px-2 py-1 rounded border bg-green-50 text-green-800 border-green-200">Mulig besparelse {kr(total)}</span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1">Linje</th><th>Nu</th><th>Billigst</th><th className="text-right">Besparelse</th></tr></thead>
        <tbody>
          {alts.map((a) => (
            <tr key={a.lineId} className="border-t">
              <td className="py-1">{a.description}<div className="text-xs text-muted-foreground">EAN {a.ean}</div></td>
              <td>{a.current.supplierName} · {kr(a.current.unitCost)}</td>
              <td>{a.best.supplierName} · {kr(a.best.unitCost)}<div className="text-xs text-muted-foreground">varenr. {a.best.sku}</div></td>
              <td className="text-right font-medium text-green-800">{kr(a.savingTotal)} ({a.savingPct} %)</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">Baseret på kostpriser i leverandørkataloget (samme EAN). Skift leverandør på linjen for at udnytte besparelsen.</p>
    </div>
  )
}
