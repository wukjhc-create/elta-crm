'use client'

/**
 * Sprint Ø9.1 — Leverandørfaktura-forfaldswidget ("pengene ud").
 *
 * INTERN indkøbsøkonomi — gated incoming_invoices.view (mount-betinget).
 * Tæller forfaldne/snart-forfaldne GODKENDTE leverandørfakturaer (afventer
 * bogføring/betaling) + samlet beløb + top-3 ældste forfaldne. Read-only.
 * Adskilt fra kundevendte salgs-/projektøkonomi-views. Ingen secrets, ingen
 * portal, ingen e-conomic-push.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Banknote, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { getIncomingInvoiceDueSummaryAction, type IncomingDueSummary } from '@/lib/actions/incoming-invoices'
import { formatCurrency } from '@/lib/utils/format'

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function IncomingInvoiceDueWidget() {
  const [data, setData] = useState<IncomingDueSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getIncomingInvoiceDueSummaryAction()
      .then((r) => { if (!alive) return; if (r.ok) setData(r); else setError(r.message || 'Kunne ikke hente forfaldsoverblik') })
      .catch(() => { if (alive) setError('Kunne ikke hente forfaldsoverblik') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const kr = (n: number) => formatCurrency(n, data?.currency || 'DKK', 0)

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Banknote className="w-5 h-5 text-red-600" />
          Leverandørfakturaer — forfald
        </h2>
        <Link href="/dashboard/incoming-invoices" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
          Overblik <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-4">{error || 'Ingen data'}</p>
      ) : data.overdue_count === 0 && data.due_7_count === 0 ? (
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Ingen godkendte leverandørfakturaer forfalder lige nu.</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dashboard/incoming-invoices?due=overdue" className="rounded-lg ring-1 ring-red-200 bg-red-50 px-3 py-2.5 hover:bg-red-100">
              <div className="flex items-center gap-1.5 text-xs text-gray-500"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Forfaldne</div>
              <div className="text-2xl font-bold mt-0.5 text-red-700">{data.overdue_count}</div>
              <div className="text-xs text-red-600">{kr(data.overdue_amount)}</div>
            </Link>
            <Link href="/dashboard/incoming-invoices?due=due_7" className="rounded-lg ring-1 ring-amber-200 bg-amber-50 px-3 py-2.5 hover:bg-amber-100">
              <div className="flex items-center gap-1.5 text-xs text-gray-500"><Clock className="w-3.5 h-3.5 text-amber-600" /> Inden 7 dage</div>
              <div className="text-2xl font-bold mt-0.5 text-amber-700">{data.due_7_count}</div>
              <div className="text-xs text-amber-600">{kr(data.due_7_amount)}</div>
            </Link>
          </div>

          {data.top.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="text-xs font-medium text-gray-500">Ældste forfaldne</div>
              {data.top.map((t) => (
                <Link key={t.id} href={`/dashboard/incoming-invoices/${t.id}`}
                  className="flex items-center justify-between text-sm hover:bg-gray-50 rounded px-1.5 py-1">
                  <span className="truncate text-gray-700">
                    <span className="text-xs text-gray-500">{fmtDate(t.due_date)}</span>
                    {' · '}{t.supplier_name ?? t.invoice_number ?? '—'}
                  </span>
                  <span className="font-medium text-red-700 shrink-0 ml-2">{kr(t.amount)}</span>
                </Link>
              ))}
            </div>
          )}

          <Link href="/dashboard/incoming-invoices?due=overdue" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline pt-1">
            Se forfaldne <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Intern indkøbsøkonomi — kun for fakturagodkendelse. Adskilt fra kundevendt salgsøkonomi.
      </p>
    </div>
  )
}
