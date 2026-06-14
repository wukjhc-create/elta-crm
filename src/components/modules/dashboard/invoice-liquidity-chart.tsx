'use client'

/**
 * Sprint Ø4.2 — Cost-free likviditetsgraf på dashboardet.
 *
 * Viser faktureret vs. betalt pr. måned de seneste 6 måneder, så kontoret
 * og ledelsen hurtigt kan se om pengestrømmen går den rigtige vej.
 * Simpel div-baseret søjlegraf (samme mønster som MonthlyOfferChart —
 * ingen chart-dependency). Self-fetching via getInvoiceLiquidityChartAction.
 *
 * KUN salgs/faktura-beløb — ingen kost/margin/DB.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Loader2, TrendingUp } from 'lucide-react'
import {
  getInvoiceLiquidityChartAction,
  type LiquidityMonth,
} from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils/format'

function kr(n: number): string {
  return formatCurrency(n, 'DKK', 0)
}

export function InvoiceLiquidityChart() {
  const [months, setMonths] = useState<LiquidityMonth[] | null>(null)
  const [hasData, setHasData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInvoiceLiquidityChartAction()
      if (!res.ok || !res.months) {
        setError(res.message ?? 'Kunne ikke hente likviditetsdata')
        setMonths(null)
      } else {
        setMonths(res.months)
        setHasData(!!res.has_data)
      }
    } catch {
      setError('Kunne ikke hente likviditetsdata')
      setMonths(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const max = months
    ? Math.max(1, ...months.map((m) => Math.max(m.invoiced_total, m.paid_total)))
    : 1
  const totalInvoiced = months ? months.reduce((s, m) => s + m.invoiced_total, 0) : 0
  const totalPaid = months ? months.reduce((s, m) => s + m.paid_total, 0) : 0

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Likviditet — faktureret vs. betalt de seneste 6 måneder
        </h3>
        <Link
          href="/dashboard/invoices"
          className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
        >
          Åbn fakturaoverblik <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Legende */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Faktureret
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Betalt
        </span>
        <Link href="/dashboard/invoices?filter=paid" className="ml-auto hover:underline text-blue-700">
          Se betalte →
        </Link>
        <Link href="/dashboard/invoices?filter=sent&outstanding=1" className="hover:underline text-amber-700">
          Se udestående →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter likviditetsdata…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 py-10 text-sm text-rose-600">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : !months ? null : (
        <>
          {!hasData && (
            <p className="text-xs text-gray-500 mb-2">
              Der er endnu ikke nok fakturadata til at vise en udvikling.
            </p>
          )}

          {/* Søjlegraf */}
          <div className="flex items-end justify-between gap-2 h-40 border-b border-gray-200">
            {months.map((m) => {
              const invH = Math.round((m.invoiced_total / max) * 100)
              const paidH = Math.round((m.paid_total / max) * 100)
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="flex items-end justify-center gap-1 w-full h-full">
                    <div
                      className="w-1/3 max-w-[18px] bg-emerald-500 rounded-t transition-all"
                      style={{ height: `${invH}%` }}
                      title={`Faktureret ${m.month_label}: ${kr(m.invoiced_total)}`}
                    />
                    <div
                      className="w-1/3 max-w-[18px] bg-blue-500 rounded-t transition-all"
                      style={{ height: `${paidH}%` }}
                      title={`Betalt ${m.month_label}: ${kr(m.paid_total)}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {/* Måned-labels */}
          <div className="flex items-center justify-between gap-2 mt-1">
            {months.map((m) => (
              <div key={m.month} className="flex-1 text-center text-[11px] text-gray-500">
                {m.month_label}
              </div>
            ))}
          </div>

          {/* Total seneste 6 mdr. */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t text-xs">
            <span className="text-gray-500">Seneste 6 måneder</span>
            <span className="flex items-center gap-3">
              <span className="text-emerald-700">Faktureret <strong className="tabular-nums">{kr(totalInvoiced)}</strong></span>
              <span className="text-blue-700">Betalt <strong className="tabular-nums">{kr(totalPaid)}</strong></span>
            </span>
          </div>

          <p className="mt-2 text-[11px] text-gray-400">
            Omkostningsfrit — kun fakturabeløb inkl. moms. Faktureret = sendte/betalte fakturaer
            (på afsendelsesmåned); betalt = registreret betaling. Kreditnotaer og annullerede
            tæller ikke med. Ingen kost, margin eller dækningsbidrag.
          </p>
        </>
      )}
    </div>
  )
}
