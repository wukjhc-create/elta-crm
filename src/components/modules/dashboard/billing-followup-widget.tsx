'use client'

/**
 * Sprint Ø8.3 — Faktureringsopfølgnings-widget på dashboardet.
 *
 * "Hvad kræver fakturahandling i dag?" — tæller sager pr. Ø8.2-handlingsstatus
 * og linker direkte til de tilsvarende ?billing=-filtre. Selvhentende,
 * read-only. KUN salgs-/fakturatal — ingen kost/margin/DB. Gated
 * invoices.view.own_cases (mount-betinget i dashboardet).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList, ArrowRight, Loader2, CheckCircle2, AlertTriangle, FileCheck2, Wallet, FileQuestion } from 'lucide-react'
import { getBillingFollowupSummaryAction, type BillingFollowupSummary } from '@/lib/actions/service-case-economy'

export function BillingFollowupWidget() {
  const [data, setData] = useState<BillingFollowupSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getBillingFollowupSummaryAction()
      .then((r) => { if (!alive) return; if (r.success && r.data) setData(r.data); else setError(r.error || 'Kunne ikke hente faktureringsopfølgning') })
      .catch(() => { if (alive) setError('Kunne ikke hente faktureringsopfølgning') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          Fakturaopfølgning
        </h2>
        <Link href="/dashboard/orders" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
          Sager <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-4">{error || 'Ingen data'}</p>
      ) : data.total_action === 0 ? (
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Ingen sager kræver fakturahandling lige nu.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <Row
            href="/dashboard/orders?billing=over_invoiced"
            icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
            label="Overfakturerede"
            count={data.over_invoiced}
            tone="red"
          />
          <Row
            href="/dashboard/orders?billing=ready_final"
            icon={<FileCheck2 className="w-4 h-4 text-amber-600" />}
            label="Klar til slutfaktura"
            count={data.ready_final}
            tone="amber"
          />
          <Row
            href="/dashboard/orders?billing=outstanding"
            icon={<Wallet className="w-4 h-4 text-blue-600" />}
            label="Med udestående"
            count={data.outstanding}
            tone="blue"
          />
          {data.no_contract > 0 && (
            <Row
              href="/dashboard/orders?billing=no_contract"
              icon={<FileQuestion className="w-4 h-4 text-gray-500" />}
              label="Faktureret uden kontraktsum"
              count={data.no_contract}
              tone="gray"
            />
          )}
          {data.capped && (
            <p className="text-[11px] text-gray-400 pt-1">Viser op til de 500 mest relevante sager.</p>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Kun salgs-/fakturatal — ingen intern kost, margin eller dækningsbidrag.
      </p>
    </div>
  )
}

function Row({ href, icon, label, count, tone }: {
  href: string; icon: React.ReactNode; label: string; count: number
  tone: 'red' | 'amber' | 'blue' | 'gray'
}) {
  const ring = tone === 'red' ? 'ring-red-200 hover:bg-red-50' : tone === 'amber' ? 'ring-amber-200 hover:bg-amber-50' : tone === 'blue' ? 'ring-blue-200 hover:bg-blue-50' : 'ring-gray-200 hover:bg-gray-50'
  const num = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : tone === 'blue' ? 'text-blue-700' : 'text-gray-700'
  const muted = count === 0
  return (
    <Link href={href} className={`flex items-center justify-between rounded-lg ring-1 px-3 py-2 ${muted ? 'ring-gray-100 opacity-60' : ring}`}>
      <span className="inline-flex items-center gap-2 text-sm text-gray-700">{icon} {label}</span>
      <span className={`text-lg font-bold ${muted ? 'text-gray-400' : num}`}>{count}</span>
    </Link>
  )
}
