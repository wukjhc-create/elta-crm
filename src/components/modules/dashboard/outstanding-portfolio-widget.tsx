'use client'

/**
 * Sprint Ø8.1 — Portefølje-widget: udestående på tværs af aktive sager.
 *
 * "Hvor ligger pengene?" — samlet udestående/netto faktureret + top-3 sager.
 * Selvhentende, read-only. KUN salgs-/fakturatal — ingen kost/margin/DB.
 * Gated invoices.view.own_cases (mount-betinget i dashboardet).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Wallet, ArrowRight, Loader2, CheckCircle2, TrendingUp } from 'lucide-react'
import { getCaseOutstandingPortfolioAction, type OutstandingPortfolio } from '@/lib/actions/service-case-economy'
import { formatCurrency } from '@/lib/utils/format'

export function OutstandingPortfolioWidget() {
  const [data, setData] = useState<OutstandingPortfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getCaseOutstandingPortfolioAction()
      .then((r) => { if (!alive) return; if (r.success && r.data) setData(r.data); else setError(r.error || 'Kunne ikke hente porteføljeøkonomi') })
      .catch(() => { if (alive) setError('Kunne ikke hente porteføljeøkonomi') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const kr = (n: number) => formatCurrency(n, data?.currency || 'DKK', 0)

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-amber-600" />
          Udestående på sager
        </h2>
        <Link href="/dashboard/orders" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
          Alle sager <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-4">{error || 'Ingen data'}</p>
      ) : data.cases_with_outstanding === 0 ? (
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Ingen udestående på aktive sager.{data.total_net_invoiced > 0 && ` ${kr(data.total_net_invoiced)} faktureret.`}</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50 px-3 py-2.5">
              <div className="text-xs text-gray-500">Samlet udestående</div>
              <div className="text-2xl font-bold mt-0.5 text-amber-700">{kr(data.total_outstanding)}</div>
            </div>
            <div className="rounded-lg ring-1 ring-gray-200 bg-gray-50 px-3 py-2.5">
              <div className="text-xs text-gray-500 inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Netto faktureret</div>
              <div className="text-2xl font-bold mt-0.5 text-gray-800">{kr(data.total_net_invoiced)}</div>
            </div>
          </div>

          <div className="text-xs text-gray-500">{data.cases_with_outstanding} sag(er) med udestående</div>

          {data.top.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="text-xs font-medium text-gray-500">Største udestående</div>
              {data.top.map((t) => (
                <Link key={t.case_id} href={`/dashboard/orders/${t.case_id}`}
                  className="flex items-center justify-between text-sm hover:bg-gray-50 rounded px-1.5 py-1">
                  <span className="truncate text-gray-700">
                    <span className="font-mono text-xs text-emerald-700">{t.case_number ?? '—'}</span>
                    {t.title ? ` · ${t.title}` : ''}
                  </span>
                  <span className="font-medium text-amber-700 shrink-0 ml-2">{kr(t.outstanding)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Kun salgs-/fakturatal — ingen intern kost, margin eller dækningsbidrag.
      </p>
    </div>
  )
}
