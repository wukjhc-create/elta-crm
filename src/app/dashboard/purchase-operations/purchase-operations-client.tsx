'use client'

/**
 * Sprint Ø9.6 — Indkøbsdrift (fuld driftsside): filtre + server-side pagination.
 *
 * INTERN indkøbsøkonomi — ikke kundevendt. Data hentes via gated server action
 * (incoming_invoices.view; beløb bag economy.cost_prices). URL-drevne filtre/
 * search/sort/page så links kan deles. Read-only.
 */

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, Loader2, AlertTriangle, Clock, ArrowRight, CheckCircle2, FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getPurchaseOperationsPageAction,
  type PurchaseOperationsPage,
  type PurchaseOpsActionReason,
  type PurchaseOpsReasonFilter,
  type PurchaseOpsSort,
} from '@/lib/actions/purchase-operations'
import { formatCurrency } from '@/lib/utils/format'

const REASON_BADGE: Record<PurchaseOpsActionReason, { label: string; cls: string }> = {
  approved_unconverted: { label: 'Godkendt — ikke ført', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  posted_unconverted: { label: 'Bogført — ikke ført', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  overdue: { label: 'Forfalden', cls: 'bg-red-50 text-red-700 ring-red-200' },
  due_soon: { label: 'Forfalder snart', cls: 'bg-yellow-50 text-yellow-700 ring-yellow-200' },
}

const REASON_FILTERS: Array<{ value: PurchaseOpsReasonFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'action_required', label: 'Kræver handling' },
  { value: 'approved_unconverted', label: 'Godkendt — ikke ført' },
  { value: 'posted_unconverted', label: 'Bogført — ikke ført' },
  { value: 'overdue', label: 'Forfaldne' },
  { value: 'due_soon', label: 'Forfalder snart' },
  { value: 'received_awaiting_unconverted', label: 'Modtaget/afventer' },
]

const SORT_OPTIONS: Array<{ value: PurchaseOpsSort; label: string }> = [
  { value: 'priority', label: 'Prioritet' },
  { value: 'amount', label: 'Beløb' },
  { value: 'due_date', label: 'Forfald' },
  { value: 'newest_invoice', label: 'Nyeste faktura' },
]

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function PurchaseOperationsClient() {
  const router = useRouter()
  const sp = useSearchParams()

  const reason = (sp.get('reason') as PurchaseOpsReasonFilter) || 'all'
  const sort = (sp.get('sort') as PurchaseOpsSort) || 'priority'
  const supplier = sp.get('supplier') || ''
  const q = sp.get('q') || ''
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)

  const [data, setData] = useState<PurchaseOperationsPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(q)

  useEffect(() => { setSearchInput(q) }, [q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    getPurchaseOperationsPageAction({ page, pageSize: 25, reason, sort, supplier, search: q })
      .then((r) => { if (!alive) return; if (r.ok) { setData(r); setError(null) } else setError(r.message || 'Kunne ikke hente indkøbsdrift') })
      .catch(() => { if (alive) setError('Kunne ikke hente indkøbsdrift') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [page, reason, sort, supplier, q])

  // Opdatér URL. Nulstiller page til 1 når et ikke-page-filter ændres.
  const setParams = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '' || (k === 'reason' && v === 'all') || (k === 'sort' && v === 'priority')) next.delete(k)
      else next.set(k, v)
    }
    if (resetPage && !('page' in patch)) next.delete('page')
    router.replace(`/dashboard/purchase-operations${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }, [router, sp])

  const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, data?.currency || 'DKK', 0))
  const canAmt = !!data?.can_view_amounts

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-blue-600" /> Indkøbsdrift
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sager hvor leverandørfakturaer kræver handling — ikke-konverterede linjer og forfald, på tværs af porteføljen.
        </p>
      </div>

      {/* Summary stats (globale, uafhængigt af filter) */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button onClick={() => setParams({ reason: 'action_required' })} className="text-left rounded-lg ring-1 ring-gray-200 bg-white px-4 py-3 hover:ring-blue-300">
            <div className="text-xs text-gray-500">Sager med handling</div>
            <div className="text-2xl font-bold mt-0.5 text-blue-700">{data.summary.total_cases_with_action}</div>
          </button>
          <button onClick={() => setParams({ reason: 'approved_unconverted' })} className="text-left rounded-lg ring-1 ring-gray-200 bg-white px-4 py-3 hover:ring-amber-300">
            <div className="text-xs text-gray-500">Ukonverterede linjer</div>
            <div className="text-2xl font-bold mt-0.5 text-amber-700">{data.summary.total_unconverted_lines}</div>
            {canAmt && data.summary.total_unconverted_amount != null && <div className="text-xs text-gray-500 mt-0.5">{kr(data.summary.total_unconverted_amount)}</div>}
          </button>
          <button onClick={() => setParams({ reason: 'overdue' })} className="text-left rounded-lg ring-1 ring-gray-200 bg-white px-4 py-3 hover:ring-red-300">
            <div className="text-xs text-gray-500">Forfaldne fakturaer</div>
            <div className="text-2xl font-bold mt-0.5 text-red-700">{data.summary.overdue_invoice_count}</div>
          </button>
          <button onClick={() => setParams({ reason: 'due_soon' })} className="text-left rounded-lg ring-1 ring-gray-200 bg-white px-4 py-3 hover:ring-amber-300">
            <div className="text-xs text-gray-500">Forfalder inden 7 dage</div>
            <div className="text-2xl font-bold mt-0.5 text-amber-700">{data.summary.due_soon_invoice_count}</div>
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {REASON_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setParams({ reason: f.value })}
              className={`text-xs px-2.5 py-1 rounded-full ring-1 ${reason === f.value ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form
            onSubmit={(e) => { e.preventDefault(); setParams({ q: searchInput.trim() || null }) }}
            className="flex items-center gap-2 flex-1 min-w-[220px]"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Søg sag, kunde, leverandør, fakturanr…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Søg</button>
            {q && <button type="button" onClick={() => setParams({ q: null })} className="text-xs text-gray-500 hover:underline">Ryd</button>}
          </form>

          {data && data.supplier_options.length > 0 && (
            <select value={supplier} onChange={(e) => setParams({ supplier: e.target.value || null })}
              className="text-sm rounded-md border border-gray-300 px-2 py-1.5 max-w-[200px]">
              <option value="">Alle leverandører</option>
              {data.supplier_options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          <label className="text-xs text-gray-500 inline-flex items-center gap-1.5">
            Sortér
            <select value={sort} onChange={(e) => setParams({ sort: e.target.value })}
              className="text-sm rounded-md border border-gray-300 px-2 py-1.5">
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-red-600 py-4">{error || 'Ingen data'}</p>
      ) : (
        <>
          {data.truncated && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Bemærk: kun de seneste {3000} fakturaer indgår (scan-cap nået) — tallene kan være et undersæt.
            </p>
          )}

          {data.items.length === 0 ? (
            <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              {reason === 'all' && !q && !supplier ? 'Ingen sager kræver indkøbshandling lige nu.' : 'Ingen sager matcher de valgte filtre.'}
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left font-medium px-4 py-2.5">Sag</th>
                      <th className="text-left font-medium px-4 py-2.5">Leverandør</th>
                      <th className="text-left font-medium px-4 py-2.5">Årsag</th>
                      <th className="text-right font-medium px-4 py-2.5">Linjer</th>
                      {canAmt && <th className="text-right font-medium px-4 py-2.5">Beløb</th>}
                      <th className="text-left font-medium px-4 py-2.5">Seneste faktura</th>
                      <th className="text-right font-medium px-4 py-2.5">Handling</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.items.map((c) => (
                      <tr key={c.case_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{c.case_number ?? c.case_id.slice(0, 8)}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{c.customer_label ?? c.case_title ?? '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs truncate max-w-[160px]">
                          {c.supplier_names.length ? c.supplier_names.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {c.action_reasons.map((r) => (
                              <span key={r} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${REASON_BADGE[r].cls}`}>{REASON_BADGE[r].label}</span>
                            ))}
                            {c.action_reasons.length === 0 && c.received_awaiting_count > 0 && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 bg-gray-50 text-gray-600 ring-gray-200">Modtaget/afventer</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{c.unconverted_line_count > 0 ? c.unconverted_line_count : '—'}</td>
                        {canAmt && <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{kr(c.unconverted_amount)}</td>}
                        <td className="px-4 py-2.5 text-gray-600">
                          <div>{fmtDate(c.latest_invoice_date)}</div>
                          {c.latest_due_date && <div className="text-xs text-gray-400">forfald {fmtDate(c.latest_due_date)}</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={c.case_link} className="inline-flex items-center gap-1 text-emerald-700 hover:underline text-xs">Åbn sag <ArrowRight className="w-3 h-3" /></Link>
                            {c.top_invoice_link && (
                              <Link href={c.top_invoice_link} className="inline-flex items-center gap-1 text-blue-700 hover:underline text-xs"><FileText className="w-3 h-3" /> Faktura</Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
                <span>
                  {(data.page - 1) * data.page_size + 1}
                  –{Math.min(data.page * data.page_size, data.total_count)} af {data.total_count}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={data.page <= 1}
                    onClick={() => setParams({ page: String(data.page - 1) }, false)}
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md ring-1 ring-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  ><ChevronLeft className="w-4 h-4" /> Forrige</button>
                  <span className="px-2 text-xs text-gray-500">Side {data.page} / {data.total_pages}</span>
                  <button
                    disabled={data.page >= data.total_pages}
                    onClick={() => setParams({ page: String(data.page + 1) }, false)}
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md ring-1 ring-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >Næste <ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            Intern indkøbsøkonomi — ikke kundevendt. {canAmt ? '' : 'Beløb skjult (kræver kost-adgang). '}
            Forfald regnes for godkendte/bogførte fakturaer; modtaget/afventer-fakturaer indgår ikke som driftproblem.
          </p>
        </>
      )}
    </div>
  )
}
