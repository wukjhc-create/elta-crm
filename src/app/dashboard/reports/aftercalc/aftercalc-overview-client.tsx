'use client'

/**
 * Ledelsesoversigt: tilbudt mod faktisk DB pr. sag.
 * Kost hentes først når oversigten åbnes, og rækkerne ryddes når den lukkes.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Loader2, Scale } from 'lucide-react'
import { getAftercalcOverview } from '@/lib/actions/case-aftercalc'
import { DATA_QUALITY_LABELS, type DataQualityCode } from '@/lib/cases/aftercalc'
import {
  type AftercalcOverviewFilters,
  type AftercalcOverviewResult,
  type AftercalcSort,
  type AftercalcVarianceFilter,
} from '@/lib/cases/aftercalc-overview'
import { useCostReveal } from '@/components/shared/sensitive-amounts'
import { formatCurrency } from '@/lib/utils/format'
import { SERVICE_CASE_STATUSES, SERVICE_CASE_STATUS_LABELS, type ServiceCaseStatus } from '@/types/service-cases.types'

const SORTS: { id: AftercalcSort; label: string }[] = [
  { id: 'worst_db', label: 'Dårligste DB-afvigelse' },
  { id: 'biggest_loss', label: 'Største tab' },
  { id: 'biggest_gain', label: 'Højeste gevinst' },
  { id: 'missing_data', label: 'Manglende data' },
  { id: 'newest', label: 'Nyeste' },
]

const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('da-DK', { maximumFractionDigits: 1 })} %`)

function varianceText(amount: number | null, points: number | null) {
  if (amount == null) return '—'
  const sign = amount > 0 ? '+' : ''
  const pointsText = points == null ? '' : ` (${sign}${points.toLocaleString('da-DK', { maximumFractionDigits: 1 })} pp)`
  return `${sign}${kr(amount)}${pointsText}`
}

export function AftercalcOverviewClient() {
  const [open, toggle] = useCostReveal()
  const [filters, setFilters] = useState<AftercalcOverviewFilters>({ sort: 'worst_db', page: 1, variance: 'all' })
  const [data, setData] = useState<AftercalcOverviewResult | null>(null)
  const [assignees, setAssignees] = useState<AftercalcOverviewResult['assignees']>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(null)
    getAftercalcOverview(filters).then((res) => {
      if (!alive) return
      setLoading(false)
      if (res.success && res.data) {
        setData(res.data)
        setAssignees(res.data.assignees)
      } else {
        setData(null)
        setError(res.error ?? 'Kunne ikke hente oversigten')
      }
    })
    return () => { alive = false }
  }, [open, filters])

  useEffect(() => { if (!open) setData(null) }, [open])

  const setFilter = (patch: AftercalcOverviewFilters, keepPage = false) => {
    setFilters((prev) => ({ ...prev, ...patch, page: keepPage ? patch.page ?? prev.page : 1 }))
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-6 space-y-4" data-testid="aftercalc-overview">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Efterkalkulation</h1>
          <p className="text-gray-500">Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.</p>
        </div>
        <Link href="/dashboard/reports" className="text-sm text-blue-700 hover:underline shrink-0">Tilbage til rapporter</Link>
      </div>

      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
        <button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left" data-testid="aftercalc-overview-toggle" aria-expanded={open}>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Scale className="w-4 h-4 text-gray-500" />
            Sager
          </h2>
          {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </button>
        {!open && <p className="mt-1 text-xs text-gray-500">Kost og DB er skjult, indtil du åbner oversigten.</p>}

        {open && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
              <label className="block">
                <span className="text-xs text-gray-500">Fra</span>
                <input type="date" value={filters.from ?? ''} onChange={(e) => setFilter({ from: e.target.value || null })} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Til</span>
                <input type="date" value={filters.to ?? ''} onChange={(e) => setFilter({ to: e.target.value || null })} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Ansvarlig</span>
                <select value={filters.assigneeId ?? ''} onChange={(e) => setFilter({ assigneeId: e.target.value || null })} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1">
                  <option value="">Alle</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name || 'Uden navn'}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Status</span>
                <select value={filters.status ?? ''} onChange={(e) => setFilter({ status: e.target.value || null })} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1">
                  <option value="">Alle undtagen konverterede</option>
                  {SERVICE_CASE_STATUSES.map((s) => <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Afvigelse</span>
                <select value={(filters.variance ?? 'all') as AftercalcVarianceFilter} onChange={(e) => setFilter({ variance: e.target.value as AftercalcVarianceFilter })} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1">
                  <option value="all">Alle</option>
                  <option value="negative">Negativ DB</option>
                  <option value="positive">Positiv DB</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Sortering</span>
                <select value={(filters.sort ?? 'worst_db') as AftercalcSort} onChange={(e) => setFilter({ sort: e.target.value as AftercalcSort })} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={filters.missingCostOnly === true} onChange={(e) => setFilter({ missingCostOnly: e.target.checked })} />
              Kun manglende kostdata
            </label>

            {error && <p className="text-sm text-red-700">{error}</p>}
            {loading && !data && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</p>}

            {data && (
              <>
                {data.truncated && (
                  <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">
                    Viser de {data.cases_considered} nyeste sager i filtret. Ældre sager er ikke beregnet.
                  </p>
                )}
                {data.rows.length === 0 ? (
                  <p className="text-sm text-gray-500">Ingen sager matcher filtrene.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Sag</th>
                          <th className="px-2 py-1.5 text-left">Kunde</th>
                          <th className="px-2 py-1.5 text-left">Ansvarlig</th>
                          <th className="px-2 py-1.5 text-right">Tilbudt omsætning</th>
                          <th className="px-2 py-1.5 text-right">Faktisk omsætning</th>
                          <th className="px-2 py-1.5 text-right">Tilbudt DB %</th>
                          <th className="px-2 py-1.5 text-right">Faktisk DB %</th>
                          <th className="px-2 py-1.5 text-right">DB-afvigelse</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                          <th className="px-2 py-1.5 text-left">Datakvalitet</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.rows.map((r) => (
                          <tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality}>
                            <td className="px-2 py-1.5">
                              <Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="text-blue-700 hover:underline">
                                {r.case_number || 'Sag'}
                              </Link>
                              {r.title && <div className="text-[11px] text-gray-500 truncate max-w-[16rem]">{r.title}</div>}
                            </td>
                            <td className="px-2 py-1.5 text-gray-800">{r.customer_name || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-800">{r.assignee_name || '—'}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{kr(r.quoted_revenue)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{kr(r.actual_revenue)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.quoted_db_pct)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.actual_db_pct)}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${r.db_variance == null ? 'text-gray-400' : r.db_variance < 0 ? 'text-red-700' : r.db_variance > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                              {varianceText(r.db_variance, r.db_variance_pct_points)}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700">{SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status}</td>
                            <td className="px-2 py-1.5" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(', ')}>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${r.data_quality === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
                                {r.data_quality === 'warning' ? 'Advarsel' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{data.total} sager i visningen. Beregnet på {data.query_ms} ms.</span>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={(data.page ?? 1) <= 1} onClick={() => setFilter({ page: (data.page ?? 1) - 1 }, true)} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige</button>
                    <span>Side {data.page} af {pages}</span>
                    <button type="button" disabled={(data.page ?? 1) >= pages} onClick={() => setFilter({ page: (data.page ?? 1) + 1 }, true)} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Næste</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
