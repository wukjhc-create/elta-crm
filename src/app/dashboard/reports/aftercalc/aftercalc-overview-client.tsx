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
  invoicedStateLabel,
  offerMissingCostFilter,
  varianceFilterLabel,
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
  if (amount == null) return 'Kan ikke beregnes'
  const sign = amount > 0 ? '+' : ''
  const pointsText = points == null ? '' : ` (${sign}${points.toLocaleString('da-DK', { maximumFractionDigits: 1 })} pp)`
  return `${sign}${kr(amount)}${pointsText}`
}

export function AftercalcOverviewClient() {
  const [open, toggle] = useCostReveal()
  const [filters, setFilters] = useState<AftercalcOverviewFilters>({ sort: 'worst_db', page: 1, variance: 'all' })
  const [data, setData] = useState<AftercalcOverviewResult | null>(null)
  const [assignees, setAssignees] = useState<AftercalcOverviewResult['assignees']>([])
  const [assigneesError, setAssigneesError] = useState<string | null>(null)
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
        if (!res.data.assignees_failed) setAssignees(res.data.assignees)
        setAssigneesError(res.data.assignees_failed ? 'Ansvarlige kunne ikke hentes. Det tælles ikke som ingen.' : null)
      } else {
        setData(null)
        setAssigneesError(null)
        setError(res.error ?? 'Kunne ikke hente oversigten')
      }
    })
    return () => { alive = false }
  }, [open, filters])

  useEffect(() => { if (!open) setData(null) }, [open])

  const setFilter = (patch: AftercalcOverviewFilters, keepPage = false) => {
    setFilters((prev) => ({ ...prev, ...patch, page: keepPage ? patch.page ?? prev.page : 1 }))
  }
  const filtersActive = Boolean(
    filters.from || filters.to || filters.assigneeId || filters.status || filters.missingCostOnly
    || (filters.variance && filters.variance !== 'all')
    || (filters.sort && filters.sort !== 'worst_db')
  )
  const resetFilters = () => setFilters({ sort: 'worst_db', page: 1, variance: 'all' })

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="aftercalc-overview">
      <div className="flex flex-wrap items-start justify-between gap-3 break-words min-w-0" data-testid="aftercalc-overview-heading-row">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 break-words min-w-0" data-testid="aftercalc-overview-title">Efterkalkulation</h1>
          <p className="text-gray-500 break-words min-w-0" data-testid="aftercalc-overview-intro">Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.</p>
        </div>
        <Link href="/dashboard/reports" className="text-sm text-blue-700 hover:underline break-words min-w-0" data-testid="aftercalc-back-link">Tilbage til rapporter</Link>
      </div>

      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 break-words min-w-0" data-testid="aftercalc-overview-filter-card">
        <button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left break-words min-w-0" data-testid="aftercalc-overview-toggle" aria-expanded={open}>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 break-words min-w-0" data-testid="aftercalc-sager-heading">
            <Scale className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-sager-icon" />
            Sager
          </h2>
          {open ? <ChevronDown className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-fold-open-icon" /> : <ChevronRight className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-fold-closed-icon" />}
        </button>
        {!open && <p className="mt-1 text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-overview-closed-hint">Kost og DB er skjult, indtil du åbner oversigten.</p>}

        {open && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm min-w-0">
              <label className="block min-w-0">
                <span className="text-xs text-gray-500 break-words min-w-0">Fra dato</span>
                <input type="date" value={filters.from ?? ''} onChange={(e) => setFilter({ from: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1" />
              </label>
              <label className="block min-w-0">
                <span className="text-xs text-gray-500 break-words min-w-0">Til dato</span>
                <input type="date" value={filters.to ?? ''} onChange={(e) => setFilter({ to: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1" />
              </label>
              <label className="block min-w-0">
                <span className="text-xs text-gray-500 break-words min-w-0">Ansvarlig</span>
                <select value={filters.assigneeId ?? ''} onChange={(e) => setFilter({ assigneeId: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1">
                  <option value="">Alle</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name || 'Uden navn'}</option>)}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-xs text-gray-500 break-words min-w-0">Status</span>
                <select value={filters.status ?? ''} onChange={(e) => setFilter({ status: e.target.value || null })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1">
                  <option value="">Alle undtagen konverterede</option>
                  {SERVICE_CASE_STATUSES.map((s) => <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>)}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-xs text-gray-500 break-words min-w-0">Afvigelse</span>
                <select value={(filters.variance ?? 'all') as AftercalcVarianceFilter} onChange={(e) => setFilter({ variance: e.target.value as AftercalcVarianceFilter })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1">
                  <option value="all">Alle</option>
                  <option value="negative">Negativ DB</option>
                  <option value="positive">Positiv DB</option>
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-xs text-gray-500 break-words min-w-0">Sortering</span>
                <select value={(filters.sort ?? 'worst_db') as AftercalcSort} onChange={(e) => setFilter({ sort: e.target.value as AftercalcSort })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            {assigneesError && (
              <p className="text-sm text-red-800 break-words min-w-0" data-testid="aftercalc-assignees-error">{assigneesError}</p>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
              <input type="checkbox" checked={filters.missingCostOnly === true} onChange={(e) => setFilter({ missingCostOnly: e.target.checked })} />
              <span className="break-words min-w-0" data-testid="aftercalc-missing-cost-label">Kun manglende kostdata</span>
            </label>

            {error && <p className="text-sm text-red-700 break-words min-w-0" data-testid="aftercalc-overview-error">{error}</p>}
            {loading && !data && <p className="text-sm text-gray-500 flex items-center gap-2 break-words min-w-0" data-testid="aftercalc-overview-loading"><Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="aftercalc-overview-loading-spinner" /> Henter…</p>}

            {data && (
              <>
                {data.truncated && (
                  <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 break-words min-w-0" data-testid="aftercalc-truncated">
                    Viser de {data.cases_considered} nyeste sager i filtret. Ældre sager er ikke beregnet.
                  </p>
                )}
                <div className="text-sm text-gray-800 break-words min-w-0" data-testid="aftercalc-quality-summary">
                  {data.quality.missingCost} af {data.quality.cases} sager i filtret mangler kost. DB kan ikke beregnes for {data.quality.dbUnknown}. {data.quality.warning} har datakvalitet advarsel.
                  {offerMissingCostFilter(data.quality.missingCost, filters.missingCostOnly) && (
                    <button type="button" className="ml-1 text-blue-700 hover:underline break-words min-w-0" data-testid="aftercalc-show-missing-cost" onClick={() => setFilter({ missingCostOnly: true })}>
                      Vis dem
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-600 break-words min-w-0" data-testid="aftercalc-variance-filter">Afvigelsesfilter: {varianceFilterLabel(filters.variance)}</p>
                {data.rows.length === 0 ? (
                  <div className="text-sm text-gray-500 break-words min-w-0" data-testid="aftercalc-empty">
                    <p className="break-words min-w-0">{filtersActive ? 'Ingen sager matcher filtrene.' : 'Ingen sager i oversigten. Opret en sag fra kunden, så den kan efterkalkuleres her.'}</p>
                    {filtersActive && (
                      <button type="button" onClick={resetFilters} className="mt-2 text-blue-700 hover:underline break-words min-w-0" data-testid="aftercalc-clear-filters">
                        Nulstil filtre
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                  <div className="md:hidden space-y-2 break-words min-w-0" data-testid="aftercalc-overview-mobile">
                    {data.rows.map((r) => (
                      <article key={r.case_id} className="rounded-lg ring-1 ring-gray-200 p-3 break-words min-w-0" data-testid="aftercalc-mobile-card">
                        <div className="flex items-start justify-between gap-2 break-words min-w-0" data-testid="aftercalc-card-head">
                          <div className="min-w-0">
                            <Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="font-medium text-blue-700 hover:underline break-words min-w-0" data-testid="aftercalc-mobile-case-link">
                              {r.case_number || 'Sag'}
                            </Link>
                            {r.title && <p className="text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-mobile-title">{r.title}</p>}
                            <p className="text-sm text-gray-800 break-words min-w-0" data-testid="aftercalc-mobile-customer">{r.customer_name || '—'}</p>
                            <p className="text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-mobile-assignee">Ansvarlig: {r.assignee_name || '—'}</p>
                          </div>
                          <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${r.data_quality === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
                            {r.data_quality === 'warning' ? 'Advarsel' : 'OK'}
                          </span>
                        </div>
                        {r.warning_codes.length > 0 && (
                          <p className="mt-1 text-xs text-amber-900 break-words min-w-0" data-testid="aftercalc-mobile-warning">
                            {r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(', ')}
                          </p>
                        )}
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0">
                          <div className="min-w-0">
                            <dt className="text-gray-500 break-words min-w-0">Tilbudt omsætning</dt>
                            <dd className="tabular-nums text-gray-900 break-words">{kr(r.quoted_revenue)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500 break-words min-w-0">Faktisk omsætning</dt>
                            <dd className="tabular-nums text-gray-900 break-words">{kr(r.actual_revenue)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500 break-words min-w-0">Tilbudt DB</dt>
                            <dd className="tabular-nums text-gray-900 break-words">{pct(r.quoted_db_pct)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-gray-500 break-words min-w-0">Faktisk DB</dt>
                            <dd className="tabular-nums text-gray-900 break-words">{pct(r.actual_db_pct)}</dd>
                          </div>
                        </dl>
                        <p className={`mt-2 text-sm tabular-nums break-words ${r.db_variance == null ? 'text-gray-400' : r.db_variance < 0 ? 'text-red-700' : r.db_variance > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                          DB-afvigelse: {varianceText(r.db_variance, r.db_variance_pct_points)}
                        </p>
                        <p className="text-xs text-gray-600 break-words min-w-0" data-testid="aftercalc-mobile-status">{SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status}</p>
                        <p className="text-xs text-gray-600 break-words min-w-0" data-testid="aftercalc-invoiced-state">{invoicedStateLabel(r.invoiced_state)}</p>
                      </article>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto break-words min-w-0">
                    <table className="w-full text-sm break-words min-w-0">
                      <thead className="bg-gray-50 text-xs text-gray-600 break-words min-w-0">
                        <tr className="break-words min-w-0">
                          <th className="px-2 py-1.5 text-left break-words min-w-0">Sag</th>
                          <th className="px-2 py-1.5 text-left break-words min-w-0">Kunde</th>
                          <th className="px-2 py-1.5 text-left break-words min-w-0">Ansvarlig</th>
                          <th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt omsætning</th>
                          <th className="px-2 py-1.5 text-right break-words min-w-0">Faktisk omsætning</th>
                          <th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt DB %</th>
                          <th className="px-2 py-1.5 text-right break-words min-w-0">Faktisk DB %</th>
                          <th className="px-2 py-1.5 text-right break-words min-w-0">DB-afvigelse</th>
                          <th className="px-2 py-1.5 text-left break-words min-w-0">Status</th>
                          <th className="px-2 py-1.5 text-left break-words min-w-0">Datakvalitet</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 break-words min-w-0">
                        {data.rows.map((r) => (
                          <tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality}>
                            <td className="px-2 py-1.5 break-words min-w-0">
                              <Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="text-blue-700 hover:underline break-words min-w-0">
                                {r.case_number || 'Sag'}
                              </Link>
                              {r.title && <div className="text-[11px] text-gray-500 break-words max-w-[16rem] min-w-0">{r.title}</div>}
                            </td>
                            <td className="px-2 py-1.5 text-gray-800 break-words min-w-0">{r.customer_name || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-800 break-words min-w-0">{r.assignee_name || '—'}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{kr(r.quoted_revenue)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{kr(r.actual_revenue)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{pct(r.quoted_db_pct)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{pct(r.actual_db_pct)}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums break-words min-w-0 ${r.db_variance == null ? 'text-gray-400' : r.db_variance < 0 ? 'text-red-700' : r.db_variance > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                              {varianceText(r.db_variance, r.db_variance_pct_points)}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 break-words min-w-0">{SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status}<div className="text-[11px] text-gray-500 break-words min-w-0" data-testid="aftercalc-invoiced-state">{invoicedStateLabel(r.invoiced_state)}</div></td>
                            <td className="px-2 py-1.5" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(', ')}>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${r.data_quality === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
                                {r.data_quality === 'warning' ? 'Advarsel' : 'OK'}
                              </span>
                              {r.warning_codes.length > 0 && (
                                <div className="mt-1 text-[11px] text-amber-900 break-words max-w-[12rem] min-w-0">
                                  {r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(', ')}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-pager-row">
                  <span className="break-words min-w-0" data-testid="aftercalc-view-count">{data.total} sager i visningen. Beregnet på {data.query_ms} ms.</span>
                  <div className="flex items-center gap-2" data-testid="aftercalc-pager">
                    <button type="button" disabled={(data.page ?? 1) <= 1} onClick={() => setFilter({ page: (data.page ?? 1) - 1 }, true)} className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige</button>
                    <span className="break-words min-w-0" data-testid="aftercalc-page-label">Side {data.page} af {pages}</span>
                    <button type="button" disabled={(data.page ?? 1) >= pages} onClick={() => setFilter({ page: (data.page ?? 1) + 1 }, true)} className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Næste</button>
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
