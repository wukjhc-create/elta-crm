'use client'

/**
 * Sprint Ø9.4 — Ukonverterede leverandørfaktura-linjer pr. sag.
 *
 * INTERN INDKØBSØKONOMI — vises KUN i den kost-gatede Økonomi-fane
 * (canSeeCost). Read-only driftsoverblik: leverandørfaktura-linjer matchet til
 * sagen som endnu ikke er ført ind som materiale/udlæg. Linker til det
 * eksisterende konverterings-/godkendelsesflow — ingen auto-konvertering.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, ArrowRight, Receipt } from 'lucide-react'
import {
  getServiceCaseUnconvertedSupplierLinesAction,
  type ServiceCaseUnconvertedSupplierLines,
} from '@/lib/actions/service-case-economy'
import { formatCurrency } from '@/lib/utils/format'

const STATUS_LABEL: Record<string, string> = {
  received: 'Modtaget',
  awaiting_approval: 'Afventer godkendelse',
  approved: 'Godkendt',
  posted: 'Bogført',
}

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function CaseUnconvertedSupplierLinesCard({ caseId }: { caseId: string }) {
  const [data, setData] = useState<ServiceCaseUnconvertedSupplierLines | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getServiceCaseUnconvertedSupplierLinesAction(caseId)
      .then((r) => { if (!alive) return; if (r.ok) setData(r); else setError(r.message || 'Kunne ikke hente ukonverterede linjer') })
      .catch(() => { if (alive) setError('Kunne ikke hente ukonverterede linjer') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [caseId])

  const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, data?.currency || 'DKK', 0))
  const isEmpty = !!data && data.unconverted_line_count === 0

  return (
    <div className={`bg-white rounded-lg border p-5 ${data?.has_action_required ? 'border-amber-300 ring-1 ring-amber-100' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-800">
          {data?.has_action_required
            ? <AlertTriangle className="w-4 h-4 text-amber-600" />
            : <Receipt className="w-4 h-4 text-blue-600" />}
          Ukonverterede leverandørlinjer
          <span className="text-[10px] font-medium rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-1.5 py-0.5">Intern kost</span>
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-2">{error || 'Ingen data'}</p>
      ) : isEmpty ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 rounded-md px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Alle leverandørfaktura-linjer på sagen er konverteret.
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-md px-3 py-2 text-sm ${data.has_action_required ? 'bg-amber-50 ring-1 ring-amber-200 text-amber-800' : 'bg-gray-50 ring-1 ring-gray-200 text-gray-700'}`}>
            <span className="font-semibold">{data.unconverted_line_count}</span> linje(r) fra{' '}
            <span className="font-semibold">{data.unconverted_invoice_count}</span> leverandørfaktura(er) afventer konvertering
            {data.can_view_amounts && data.total_unconverted_amount != null && (
              <> · <span className="font-semibold">{kr(data.total_unconverted_amount)}</span></>
            )}
            {data.has_action_required && (
              <div className="text-xs mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Godkendt(e) faktura(er) med linjer der ikke er ført på sagen.
              </div>
            )}
          </div>

          <div className="space-y-1">
            {data.invoices.slice(0, 8).map((iv) => (
              <Link key={iv.id} href={iv.link}
                className="flex items-center justify-between gap-2 text-sm hover:bg-gray-50 rounded px-1.5 py-1">
                <span className="truncate text-gray-700 inline-flex items-center gap-1.5 min-w-0">
                  {iv.action_required && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                  <span className="text-xs text-gray-500 shrink-0">{fmtDate(iv.invoice_date)}</span>
                  <span className="truncate">{iv.supplier_name ?? iv.invoice_number ?? '—'}</span>
                  <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1 py-0.5 shrink-0">{STATUS_LABEL[iv.status] ?? iv.status}</span>
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 text-gray-600">
                  {iv.unconverted_line_count} linje(r)
                  {data.can_view_amounts && iv.unconverted_amount != null && <span className="text-gray-500">· {kr(iv.unconverted_amount)}</span>}
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Intern indkøbsøkonomi — ikke kundevendt. Åbn leverandørfakturaen for at konvertere linjer til materiale/udlæg.
      </p>
    </div>
  )
}
