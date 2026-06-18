'use client'

/**
 * Sprint Ø9.5 — Indkøbsdrift (porteføljevidt) klient-side.
 *
 * INTERN indkøbsøkonomi — ikke kundevendt. Data hentes via gated server action
 * (incoming_invoices.view; beløb bag economy.cost_prices). Read-only liste:
 * sag · leverandør/faktura-årsag · linjer · beløb (hvis tilladt) · links.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList, Loader2, AlertTriangle, Clock, ArrowRight, CheckCircle2, FileText } from 'lucide-react'
import {
  getPurchaseOperationsDashboardAction,
  type PurchaseOperationsDashboard,
  type PurchaseOpsActionReason,
} from '@/lib/actions/purchase-operations'
import { formatCurrency } from '@/lib/utils/format'

const REASON_BADGE: Record<PurchaseOpsActionReason, { label: string; cls: string }> = {
  approved_unconverted: { label: 'Godkendt — ikke ført', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  posted_unconverted: { label: 'Bogført — ikke ført', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  overdue: { label: 'Forfalden', cls: 'bg-red-50 text-red-700 ring-red-200' },
  due_soon: { label: 'Forfalder snart', cls: 'bg-yellow-50 text-yellow-700 ring-yellow-200' },
}

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function PurchaseOperationsClient() {
  const [data, setData] = useState<PurchaseOperationsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getPurchaseOperationsDashboardAction()
      .then((r) => { if (!alive) return; if (r.ok) setData(r); else setError(r.message || 'Kunne ikke hente indkøbsdrift') })
      .catch(() => { if (alive) setError('Kunne ikke hente indkøbsdrift') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, data?.currency || 'DKK', 0))

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

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-red-600 py-4">{error || 'Ingen data'}</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryStat label="Sager med handling" value={data.total_cases_with_action} tone="blue" />
            <SummaryStat label="Ukonverterede linjer" value={data.total_unconverted_lines} tone="amber"
              sub={data.can_view_amounts && data.total_unconverted_amount != null ? kr(data.total_unconverted_amount) : undefined} />
            <SummaryStat label="Forfaldne fakturaer" value={data.overdue_invoice_count} tone="red" />
            <SummaryStat label="Forfalder inden 7 dage" value={data.due_soon_invoice_count} tone="amber" />
          </div>

          {(data.approved_with_unconverted_count > 0 || data.received_awaiting_unconverted_count > 0) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {data.approved_with_unconverted_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 ring-1 ring-amber-200 text-amber-800 px-2 py-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {data.approved_with_unconverted_count} godkendt/bogført faktura(er) med uførte linjer (driftproblem)
                </span>
              )}
              {data.received_awaiting_unconverted_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 ring-1 ring-gray-200 text-gray-600 px-2 py-1">
                  <Clock className="w-3.5 h-3.5" /> {data.received_awaiting_unconverted_count} modtaget/afventer-faktura(er) med uførte linjer (normalt flow)
                </span>
              )}
            </div>
          )}

          {data.top_cases.length === 0 ? (
            <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Ingen sager kræver indkøbshandling lige nu.
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Sag</th>
                    <th className="text-left font-medium px-4 py-2.5">Årsag</th>
                    <th className="text-right font-medium px-4 py-2.5">Linjer</th>
                    {data.can_view_amounts && <th className="text-right font-medium px-4 py-2.5">Beløb</th>}
                    <th className="text-left font-medium px-4 py-2.5">Seneste faktura</th>
                    <th className="text-right font-medium px-4 py-2.5">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.top_cases.map((c) => (
                    <tr key={c.case_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{c.case_number ?? c.case_id.slice(0, 8)}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[220px]">
                          {c.customer_label ?? c.case_title ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.action_reasons.map((r) => (
                            <span key={r} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${REASON_BADGE[r].cls}`}>
                              {REASON_BADGE[r].label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                        {c.unconverted_line_count > 0 ? c.unconverted_line_count : '—'}
                      </td>
                      {data.can_view_amounts && (
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{kr(c.unconverted_amount)}</td>
                      )}
                      <td className="px-4 py-2.5 text-gray-600">
                        <div>{fmtDate(c.latest_invoice_date)}</div>
                        {c.latest_due_date && <div className="text-xs text-gray-400">forfald {fmtDate(c.latest_due_date)}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={c.case_link} className="inline-flex items-center gap-1 text-emerald-700 hover:underline text-xs">
                            Åbn sag <ArrowRight className="w-3 h-3" />
                          </Link>
                          {c.top_invoice_link && (
                            <Link href={c.top_invoice_link} className="inline-flex items-center gap-1 text-blue-700 hover:underline text-xs">
                              <FileText className="w-3 h-3" /> Faktura
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.truncated && (
            <p className="text-xs text-amber-600">
              Bemærk: kun de seneste fakturaer er medtaget (cap nået) — tallene kan være et undersæt.
            </p>
          )}

          <p className="text-[11px] text-gray-400">
            Intern indkøbsøkonomi — ikke kundevendt. {data.can_view_amounts ? '' : 'Beløb skjult (kræver kost-adgang). '}
            Forfald regnes for godkendte/bogførte fakturaer; modtaget/afventer-fakturaer indgår ikke som driftproblem.
          </p>
        </>
      )}
    </div>
  )
}

function SummaryStat({ label, value, tone, sub }: { label: string; value: number; tone: 'blue' | 'amber' | 'red'; sub?: string }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-blue-700'
  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}
