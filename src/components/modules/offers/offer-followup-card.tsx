'use client'

/**
 * "Opfølgning" på tilbudssiden (GO-LIVE N1): sendte tilbud der venter på kunden, prioriteret efter hvad sælgeren bør
 * gøre nu (udløber snart → ring → ikke åbnet). Kun visning + genveje (ring / åbn) — sender intet.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, Phone, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { getOfferFollowupsAction } from '@/lib/actions/offer-followup'
import type { OfferFollowupItem, FollowupStage } from '@/lib/followup/offer-followup'

const STAGE_STYLE: Record<FollowupStage, string> = {
  expiring: 'bg-red-50 text-red-800 ring-red-200',
  call: 'bg-amber-50 text-amber-800 ring-amber-200',
  not_opened: 'bg-orange-50 text-orange-800 ring-orange-200',
  expired: 'bg-gray-100 text-gray-700 ring-gray-200',
  waiting: 'bg-blue-50 text-blue-800 ring-blue-200',
}
const kr = (n: number | null) => (n == null ? '' : `${n.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr`)

export function OfferFollowupCard() {
  const [items, setItems] = useState<OfferFollowupItem[] | null>(null)
  const [scope, setScope] = useState<'own' | 'all'>('own')
  const [showWaiting, setShowWaiting] = useState(false)

  useEffect(() => {
    let alive = true
    getOfferFollowupsAction().then((r) => {
      if (!alive) return
      if (r.success && r.data) { setItems(r.data.items); setScope(r.data.scope) } else setItems([])
    })
    return () => { alive = false }
  }, [])

  if (!items || items.length === 0) return null
  const actionable = items.filter((i) => i.stage !== 'waiting')
  const waiting = items.filter((i) => i.stage === 'waiting')

  return (
    <section className="bg-white rounded-lg border p-4 sm:p-5 mb-4" data-testid="offer-followup-card">
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="w-5 h-5 text-amber-600" />
        <h2 className="font-semibold">Opfølgning</h2>
        <span className="text-xs text-gray-500">
          {actionable.length > 0 ? `${actionable.length} tilbud kræver handling` : 'Ingen kræver handling nu'}
          {scope === 'own' ? ' · dine tilbud' : ' · alle sendte tilbud'}
        </span>
      </div>
      {actionable.length > 0 && <ul className="divide-y rounded-md ring-1 ring-gray-100">{actionable.map((i) => <Row key={i.offer.id} item={i} />)}</ul>}
      {waiting.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowWaiting((v) => !v)} className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
            {showWaiting ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {waiting.length} afventer stadig kunden (sendt for under 3 dage siden)
          </button>
          {showWaiting && <ul className="divide-y rounded-md ring-1 ring-gray-100 mt-2">{waiting.map((i) => <Row key={i.offer.id} item={i} />)}</ul>}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">Automatiske kundepåmindelser er ikke slået til — opfølgning sker manuelt herfra.</p>
    </section>
  )
}

function Row({ item }: { item: OfferFollowupItem }) {
  const o = item.offer
  return (
    <li className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-3 py-3" data-testid="offer-followup-row">
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 whitespace-nowrap ${STAGE_STYLE[item.stage]}`}>{item.headline}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{o.offer_number ? `${o.offer_number} · ` : ''}{o.title}</p>
        <p className="text-xs text-gray-500 truncate">{o.customer_name ?? 'Ukendt kunde'}{o.final_amount ? ` · ${kr(o.final_amount)}` : ''} — {item.detail}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {o.customer_phone && (
          <a href={`tel:${o.customer_phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
            <Phone className="w-3.5 h-3.5" /> Ring
          </a>
        )}
        <Link href={`/dashboard/offers/${o.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
          Åbn <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </li>
  )
}
