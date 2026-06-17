'use client'

/**
 * Sprint Ø8.0 — Cost-free projektøkonomi-kort på sagsdetaljen (Overblik).
 *
 * Viser kontraktsum, faktureret (netto), betalt, udestående og rest at
 * fakturere. KUN salgs-/fakturadata — INGEN intern kost, timekost,
 * materialekost, margin, DB eller dækningsbidrag. Read-only.
 * Gated invoices.view.own_cases (mount-betinget af canSeeBilling).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Wallet, ArrowRight, Loader2, AlertTriangle, Receipt } from 'lucide-react'
import { getServiceCaseProjectEconomy, type CaseProjectEconomy } from '@/lib/actions/service-case-economy'
import { formatCurrency } from '@/lib/utils/format'

export function CaseProjectEconomyCard({ caseId, caseNumber }: { caseId: string; caseNumber?: string | null }) {
  const [data, setData] = useState<CaseProjectEconomy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getServiceCaseProjectEconomy(caseId)
      .then((r) => { if (!alive) return; if (r.success && r.data) setData(r.data); else setError(r.error || 'Kunne ikke hente projektøkonomi') })
      .catch(() => { if (alive) setError('Kunne ikke hente projektøkonomi') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [caseId])

  const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, data?.currency || 'DKK', 0))

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-800">
          <Wallet className="w-4 h-4 text-emerald-600" /> Projektøkonomi
        </h3>
        {caseNumber && (
          <Link href={`/dashboard/invoices?search=${encodeURIComponent(caseNumber)}`} className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
            Fakturaer <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-2">{error || 'Ingen data'}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Kontraktsum" value={data.has_contract_sum ? kr(data.contract_sum) : '—'} />
            <Stat label="Faktureret (netto)" value={kr(data.net_invoiced)} />
            <Stat label="Betalt" value={kr(data.paid_total)} tone="emerald" />
            <Stat label="Udestående" value={kr(data.outstanding_total)} tone={data.outstanding_total > 0 ? 'amber' : undefined} />
          </div>

          {!data.has_contract_sum ? (
            <div className="rounded-md bg-gray-50 ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-500 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
              Sagen mangler en kontraktsum — “rest at fakturere” kan ikke beregnes.
            </div>
          ) : (
            <div className="rounded-md bg-blue-50 ring-1 ring-blue-100 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-600">Rest at fakturere</span>
              <span className={`text-sm font-semibold ${(data.remaining_to_invoice ?? 0) > 0 ? 'text-blue-700' : 'text-gray-700'}`}>
                {kr(data.remaining_to_invoice)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
            <span className="inline-flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5" />
              {data.invoice_count} faktura(er)
              {data.credited_total > 0 && ` · ${kr(data.credited_total)} krediteret`}
              {data.voided_count > 0 && ` · ${data.voided_count} annulleret`}
            </span>
            {data.latest_invoice && (
              <Link href={`/dashboard/invoices/${data.latest_invoice.id}`} className="text-emerald-700 hover:underline">
                Seneste{data.latest_invoice.invoice_number ? `: ${data.latest_invoice.invoice_number}` : ''}
              </Link>
            )}
          </div>

          <p className="text-[11px] text-gray-400">
            Kun salgs-/fakturatal — ingen intern kost, margin eller dækningsbidrag.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-base font-semibold ${color}`}>{value}</div>
    </div>
  )
}
