'use client'

/**
 * Sprint Ø9.3 — Intern indkøb-vs-budget pr. sag.
 *
 * INTERN INDKØBSØKONOMI — vises KUN i den kost-gatede Økonomi-fane
 * (economy.cost_prices), aldrig i Ø8 cost-free Overblik/billing. Viser
 * leverandørfaktura-omkostninger (source='supplier_invoice') op mod budget/
 * kontraktsum som ren reference (IKKE dækningsbidrag/margin). Read-only.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShoppingCart, Loader2, ArrowRight, Receipt } from 'lucide-react'
import { getServiceCasePurchaseSummary, type CasePurchaseSummary } from '@/lib/actions/service-case-economy'
import { formatCurrency } from '@/lib/utils/format'

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function CasePurchaseSummaryCard({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CasePurchaseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getServiceCasePurchaseSummary(caseId)
      .then((r) => { if (!alive) return; if (r.ok) setData(r); else setError(r.message || 'Kunne ikke hente indkøbsoverblik') })
      .catch(() => { if (alive) setError('Kunne ikke hente indkøbsoverblik') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [caseId])

  const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, data?.currency || 'DKK', 0))

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-800">
          <ShoppingCart className="w-4 h-4 text-blue-600" /> Indkøb fra leverandørfakturaer
          <span className="text-[10px] font-medium rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-1.5 py-0.5">Intern kost</span>
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-2">{error || 'Ingen data'}</p>
      ) : data.converted_line_count === 0 ? (
        <p className="text-sm text-gray-400 py-2">Ingen leverandørfaktura-linjer konverteret til denne sag endnu.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Materialer" value={kr(data.supplier_material_cost_total)} />
            <Stat label="Udlæg" value={kr(data.supplier_other_cost_total)} />
            <Stat label="Indkøb i alt" value={kr(data.supplier_purchase_total)} strong />
          </div>

          {data.budget_reference != null && (
            <div className="rounded-md bg-gray-50 ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-600 flex items-center justify-between">
              <span>{data.budget_reference_kind === 'budget' ? 'Budget' : 'Kontraktsum'} (reference)</span>
              <span className="font-medium text-gray-800">{kr(data.budget_reference)}</span>
            </div>
          )}

          <div className="text-xs text-gray-500">
            {data.converted_line_count} konverteret leverandørfaktura-linje(r)
          </div>

          {data.invoices.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="text-xs font-medium text-gray-500">Leverandørfakturaer</div>
              {data.invoices.slice(0, 5).map((iv) => (
                <Link key={iv.id} href={`/dashboard/incoming-invoices/${iv.id}`}
                  className="flex items-center justify-between text-sm hover:bg-gray-50 rounded px-1.5 py-1">
                  <span className="truncate text-gray-700 inline-flex items-center gap-1">
                    <Receipt className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{fmtDate(iv.invoice_date)}</span>
                    {' · '}{iv.supplier_name ?? iv.invoice_number ?? '—'}
                  </span>
                  <span className="font-medium text-gray-700 shrink-0 ml-2 inline-flex items-center gap-1">
                    {kr(iv.amount_incl_vat)} <ArrowRight className="w-3 h-3 text-gray-400" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Intern indkøbskost fra leverandørfakturaer. Budget/kontraktsum vises kun som reference — ikke dækningsbidrag eller margin.
      </p>
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`${strong ? 'text-lg font-bold text-gray-900' : 'text-base font-semibold text-gray-800'}`}>{value}</div>
    </div>
  )
}
