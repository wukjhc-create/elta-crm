'use client'

/**
 * Sprint Ø7.3 — Dashboardwidget: tilbud klar til sag.
 *
 * Gør accepterede/klar-til-sag tilbud uden sag synlige proaktivt. Selvhentende
 * via getOfferConversionSummaryAction. Genbruger Ø6.4-widget-mønsteret.
 *
 * KUN salgs-/visningsdata (salgssum vises) — ingen intern kost/margin/DB.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FileCheck2, ArrowRight, CheckCircle2, Loader2, Briefcase } from 'lucide-react'
import { getOfferConversionSummaryAction, type OfferConversionSummary } from '@/lib/actions/offers'
import { formatCurrency } from '@/lib/utils/format'

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export function OfferConversionWidget() {
  const [data, setData] = useState<OfferConversionSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getOfferConversionSummaryAction()
      .then((res) => { if (alive) setData(res) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileCheck2 className="w-5 h-5 text-blue-600" />
          Tilbud klar til sag
        </h2>
        <Link href="/dashboard/offers?conversion=ready" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1">
          Se alle <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter tilbudsstatus…
        </div>
      ) : !data || !data.ok ? (
        <p className="text-sm text-gray-400 py-4">Kunne ikke hente tilbudsstatus.</p>
      ) : data.ready_count === 0 ? (
        // Positiv tom-state.
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>
            Ingen tilbud venter på at blive til sag.
            {data.converted_30d > 0 && ` ${data.converted_30d} konverteret de seneste 30 dage.`}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <Link
            href="/dashboard/offers?conversion=ready"
            className="block rounded-lg ring-1 ring-blue-200 bg-blue-50 px-3 py-2.5 hover:bg-blue-100"
          >
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Briefcase className="w-3.5 h-3.5 text-blue-600" />
              Klar til sag (accepteret/sendt, uden sag)
            </div>
            <div className="text-2xl font-bold mt-0.5 text-blue-700">{data.ready_count}</div>
          </Link>

          {data.converted_30d > 0 && (
            <div className="text-xs text-gray-500 px-0.5 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {data.converted_30d} konverteret de seneste 30 dage
            </div>
          )}

          {data.latest_ready && (
            <Link
              href={`/dashboard/offers/${data.latest_ready.id}`}
              className="block rounded-lg ring-1 ring-gray-200 bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">
                  Seneste{data.latest_ready.offer_number ? ` · ${data.latest_ready.offer_number}` : ''}
                </span>
                <span className="text-xs text-gray-500">{fmtDate(data.latest_ready.created_at)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5 text-gray-600">
                <span className="truncate">{data.latest_ready.customer_name ?? '—'}</span>
                {data.latest_ready.amount != null && (
                  <span className="font-medium text-gray-800 shrink-0 ml-2">
                    {formatCurrency(data.latest_ready.amount, 'DKK')}
                  </span>
                )}
              </div>
            </Link>
          )}

          <Link href="/dashboard/offers?conversion=ready" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline pt-1">
            Opret sager fra disse tilbud <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Kun salgs-/tilbudsdata — ingen intern kost, margin eller dækningsbidrag.
      </p>
    </div>
  )
}
