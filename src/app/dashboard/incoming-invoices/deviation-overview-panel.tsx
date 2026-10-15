'use client'

/**
 * Fokus C 2026-10-15: prisafvigelser på tværs af leverandørfakturaer. Foldet sammen som standard og hentes først ved
 * åbning (kontrollen kører pr. faktura — ingen ekstra last ved hver sidevisning).
 */
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Scale } from 'lucide-react'
import { getInvoiceDeviationOverview } from '@/lib/actions/invoice-control'
import { formatCurrency } from '@/lib/utils/format'
import type { DeviationOverview } from '@/lib/invoice-control/deviation-overview'
import { humanizeErrorText } from '@/lib/auth/permission-text'

type Overview = DeviationOverview & { truncated: boolean; days: number }

const DAYS = [30, 90, 365]

export function DeviationOverviewPanel() {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(90)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInvoiceDeviationOverview(d)
      if (res.success && res.data) setData(res.data)
      else setError(humanizeErrorText(res.error) || 'Kunne ikke hente prisafvigelser')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border" data-testid="invoice-deviation-overview">
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next && !data && !loading) void load(days) }}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
        data-testid="invoice-deviation-toggle"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <Scale className="w-4 h-4 text-gray-500" />
        <span className="font-medium text-gray-900">Prisafvigelser mod aftalepriser</span>
        {data && !loading && (
          <span className={`ml-auto text-sm ${data.overcharge_total > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            {data.overcharge_total > 0 ? `${formatCurrency(data.overcharge_total, 'DKK', 2)} for meget` : 'Ingen merbetaling'}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="dev-days" className="text-gray-500">Periode</label>
            <select id="dev-days" value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); void load(d) }} className="border rounded px-2 py-1">
              {DAYS.map((d) => <option key={d} value={d}>Seneste {d} dage</option>)}
            </select>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">Kontrollerer fakturaer…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="invoice-deviation-summary">
                <div className="rounded border p-2"><div className="text-xs text-gray-500">Fakturaer kontrolleret</div><div className="font-semibold">{data.invoices}</div></div>
                <div className="rounded border p-2"><div className="text-xs text-gray-500">Med afvigelse</div><div className="font-semibold">{data.with_deviation}</div></div>
                <div className="rounded border p-2"><div className="text-xs text-gray-500">Merbetaling i alt</div><div className={`font-semibold ${data.overcharge_total > 0 ? 'text-red-600' : ''}`} data-testid="invoice-deviation-total">{formatCurrency(data.overcharge_total, 'DKK', 2)}</div></div>
                <div className="rounded border p-2">
                  <div className="text-xs text-gray-500">Linjer der kunne kontrolleres</div>
                  <div className={`font-semibold ${data.coverage_pct < 50 ? 'text-amber-600' : ''}`}>{data.coverage_pct} %</div>
                  <div className="text-[11px] text-gray-400">{data.controlled_lines} af {data.total_lines}</div>
                </div>
              </div>
              {data.by_supplier.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-gray-500"><th className="py-1.5 font-medium">Leverandør</th><th className="py-1.5 font-medium text-right">Fakturaer</th><th className="py-1.5 font-medium text-right">Afvigende linjer</th><th className="py-1.5 font-medium text-right">Merbetaling</th></tr></thead>
                    <tbody>
                      {data.by_supplier.map((s) => (
                        <tr key={s.supplier_name} className="border-b last:border-b-0">
                          <td className="py-1.5">{s.supplier_name}</td>
                          <td className="py-1.5 text-right">{s.invoices}</td>
                          <td className="py-1.5 text-right">{s.deviating_lines}</td>
                          <td className={`py-1.5 text-right ${s.overcharge_amount > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{formatCurrency(s.overcharge_amount, 'DKK', 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.rows.length > 0 ? (
                <ul className="divide-y text-sm" data-testid="invoice-deviation-rows">
                  {data.rows.slice(0, 20).map((r) => (
                    <li key={r.id} className="py-1.5 flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/incoming-invoices/${r.id}`} className="font-medium hover:underline">{r.supplier_name ?? 'Ukendt'} · {r.invoice_number ?? 'uden nr.'}</Link>
                      <span className="text-xs text-gray-400">{r.invoice_date ?? ''}</span>
                      <span className="text-xs text-gray-500">{r.deviating_lines} afvigende linje{r.deviating_lines === 1 ? '' : 'r'}</span>
                      <span className={`ml-auto ${r.overcharge_amount > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{r.overcharge_amount > 0 ? `+${formatCurrency(r.overcharge_amount, 'DKK', 2)}` : 'for billigt'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Ingen afvigelser i perioden.</p>
              )}
              {data.truncated && <p className="text-xs text-amber-600">Kun de 100 nyeste fakturaer i perioden er kontrolleret — vælg en kortere periode.</p>}
              <p className="text-[11px] text-gray-400">Forventet pris = leverandørens kostpris på fakturadatoen. Linjer uden produktmatch tælles ikke med.</p>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
