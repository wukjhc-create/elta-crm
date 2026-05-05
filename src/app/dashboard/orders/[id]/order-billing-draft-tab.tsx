'use client'

/**
 * Sprint 6B-3 — Fakturakladde-tab on /dashboard/orders/[id].
 *
 * Lists all unbilled time_logs / case_materials / case_other_costs
 * on the sag, lets operator select rows + due_days + notes, and
 * creates a status='draft' invoice via createInvoiceDraftFromCaseAction.
 *
 * On success: redirects to /dashboard/invoices/[id].
 * On failure: shows error + per-line skip detail.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, Clock, FileText, Info, Loader2, Package, Receipt,
  TrendingUp,
} from 'lucide-react'
import {
  createInvoiceDraftFromCaseAction,
  listUnbilledForCaseAction,
  type UnbilledForCase,
} from '@/lib/actions/invoices'
import {
  CASE_OTHER_COST_CATEGORY_COLORS,
  CASE_OTHER_COST_CATEGORY_LABELS,
  type CaseOtherCostCategory,
} from '@/types/case-other-costs.types'
import { formatCurrency } from '@/lib/utils/format'

const VAT_RATE = 0.25

function fmtKr(n: number): string {
  return formatCurrency(n, 'DKK', 2)
}

function fmtPct(n: number, decimals = 1): string {
  return `${new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)} %`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(s.length === 10 ? s + 'T12:00:00' : s))
}

export function OrderBillingDraftTab({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [data, setData] = useState<UnbilledForCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedTimeLogs, setSelectedTimeLogs] = useState<Set<string>>(new Set())
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set())
  const [selectedOtherCosts, setSelectedOtherCosts] = useState<Set<string>>(new Set())

  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSkipped, setSubmitSkipped] = useState<string[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await listUnbilledForCaseAction(caseId)
    setLoading(false)
    if (!res.ok || !res.data) {
      setLoadError(res.message ?? 'Kunne ikke hente data')
      return
    }
    setData(res.data)
    // Default selection: every billable row that HAS a sales price
    setSelectedTimeLogs(new Set(res.data.time_logs.filter((t) => t.has_rate).map((t) => t.id)))
    setSelectedMaterials(new Set(res.data.materials.filter((m) => m.has_sale_price).map((m) => m.id)))
    setSelectedOtherCosts(new Set(res.data.other_costs.filter((o) => o.has_sale_price).map((o) => o.id)))
  }, [caseId])

  useEffect(() => {
    reload()
  }, [reload])

  const toggleSet = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    id: string
  ) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSet(next)
  }

  const toggleAll = (
    rows: { id: string }[],
    set: Set<string>,
    setSet: (s: Set<string>) => void
  ) => {
    if (rows.length === 0) return
    const allSelected = rows.every((r) => set.has(r.id))
    if (allSelected) setSet(new Set())
    else setSet(new Set(rows.map((r) => r.id)))
  }

  // ---- Totals from selection ----
  const totals = useMemo(() => {
    if (!data) return { subtotal: 0, vat: 0, final: 0, count: 0 }
    let subtotal = 0
    let count = 0
    for (const t of data.time_logs) {
      if (selectedTimeLogs.has(t.id)) {
        subtotal += t.total_sales_price
        count += 1
      }
    }
    for (const m of data.materials) {
      if (selectedMaterials.has(m.id)) {
        subtotal += m.total_sales_price
        count += 1
      }
    }
    for (const o of data.other_costs) {
      if (selectedOtherCosts.has(o.id)) {
        subtotal += o.total_sales_price
        count += 1
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100
    const vat = r2(subtotal * VAT_RATE)
    return { subtotal: r2(subtotal), vat, final: r2(subtotal + vat), count }
  }, [data, selectedTimeLogs, selectedMaterials, selectedOtherCosts])

  const handleCreate = async () => {
    if (!data) return
    if (totals.count === 0) {
      setSubmitError('Vælg mindst én linje')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitSkipped([])

    const res = await createInvoiceDraftFromCaseAction(
      caseId,
      {
        time_log_ids: Array.from(selectedTimeLogs),
        case_material_ids: Array.from(selectedMaterials),
        case_other_cost_ids: Array.from(selectedOtherCosts),
      },
      {
        due_days: dueDays,
        notes: notes.trim() || null,
        vat_rate: 25,
      }
    )

    setSubmitting(false)
    if (!res.ok || !res.invoice_id) {
      setSubmitError(res.message)
      if (res.skipped_lines.length > 0) {
        setSubmitSkipped(res.skipped_lines.map((s) => `${s.kind} ${s.source_id.slice(0, 8)} — ${s.reason}${s.detail ? `: ${s.detail}` : ''}`))
      }
      return
    }

    // Success: redirect to detail
    startTransition(() => {
      router.push(`/dashboard/invoices/${res.invoice_id}`)
    })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-12 text-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-400" />
        Henter ufakturerede elementer…
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <div className="bg-red-50 ring-1 ring-red-200 rounded-lg p-4 text-sm text-red-900 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        {loadError ?? 'Ingen data'}
      </div>
    )
  }

  const totalRows =
    data.time_logs.length + data.materials.length + data.other_costs.length

  if (totalRows === 0) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-10 text-center">
        <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-sm font-medium text-gray-700">
          Ingen ufakturerede elementer på sagen
        </h3>
        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
          Alt er enten allerede faktureret eller intet er booget endnu.
          Opret timer, materialer eller øvrige omkostninger på sagen, og kom tilbage hertil.
        </p>
      </div>
    )
  }

  const hasMissingPrices =
    data.time_logs.some((t) => !t.has_rate) ||
    data.materials.some((m) => !m.has_sale_price) ||
    data.other_costs.some((o) => !o.has_sale_price)

  if (!data.customer_id) {
    return (
      <div className="rounded-lg ring-1 ring-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>Sagen mangler en kunde.</strong> Tilføj en kunde på sagen før
          du kan oprette en fakturakladde.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Fakturakladde</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Vælg ufakturerede timer, materialer og øvrige omkostninger. Markerede
            linjer låses til denne faktura — ingen dobbelt-fakturering.
          </p>
        </div>
        <div className="text-right text-xs text-gray-600">
          Kunde: <strong className="text-gray-900">{data.customer_name ?? '—'}</strong>
        </div>
      </div>

      {hasMissingPrices && (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Nogle linjer mangler salgspris (timesats / materiale-salg / øvrig-salg).
            Disse er <strong>ikke</strong> valgt som default — sæt salgsprisen først
            på den relevante fane (Timer / Materialer / Øvrige), eller markér dem
            manuelt hvis du accepterer at fakturere dem til 0 kr.
          </span>
        </div>
      )}

      {/* Timer */}
      <Section
        title="Timer"
        icon={<Clock className="w-4 h-4 text-emerald-600" />}
        rowCount={data.time_logs.length}
        selectedCount={data.time_logs.filter((t) => selectedTimeLogs.has(t.id)).length}
        onToggleAll={() => toggleAll(data.time_logs, selectedTimeLogs, setSelectedTimeLogs)}
      >
        {data.time_logs.length === 0 ? (
          <Empty>Ingen ufakturerede timer på sagen.</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-2 py-1.5 w-8" />
                <th className="px-2 py-1.5">Dato</th>
                <th className="px-2 py-1.5">Medarbejder</th>
                <th className="px-2 py-1.5 text-right">Timer</th>
                <th className="px-2 py-1.5 text-right">Sats</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.time_logs.map((t) => {
                const checked = selectedTimeLogs.has(t.id)
                return (
                  <tr
                    key={t.id}
                    className={`align-top ${!t.has_rate ? 'bg-amber-50/40' : ''}`}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleSet(selectedTimeLogs, setSelectedTimeLogs, t.id)
                        }
                        disabled={submitting}
                      />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-2 py-1.5">
                      {t.employee_name ?? '—'}
                      {t.description && (
                        <div className="text-[11px] text-gray-500 truncate max-w-[280px]">
                          {t.description}
                        </div>
                      )}
                      {!t.has_rate && (
                        <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Mangler timesats
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {t.hours.toLocaleString('da-DK', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {t.hourly_rate == null ? '—' : fmtKr(t.hourly_rate)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {fmtKr(t.total_sales_price)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Materialer */}
      <Section
        title="Materialer"
        icon={<Package className="w-4 h-4 text-blue-600" />}
        rowCount={data.materials.length}
        selectedCount={data.materials.filter((m) => selectedMaterials.has(m.id)).length}
        onToggleAll={() => toggleAll(data.materials, selectedMaterials, setSelectedMaterials)}
      >
        {data.materials.length === 0 ? (
          <Empty>Ingen ufakturerede materialer på sagen.</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-2 py-1.5 w-8" />
                <th className="px-2 py-1.5">Beskrivelse</th>
                <th className="px-2 py-1.5">Leverandør</th>
                <th className="px-2 py-1.5 text-right">Antal</th>
                <th className="px-2 py-1.5">Enhed</th>
                <th className="px-2 py-1.5 text-right">Stk-pris</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.materials.map((m) => (
                <tr
                  key={m.id}
                  className={`align-top ${!m.has_sale_price ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedMaterials.has(m.id)}
                      onChange={() => toggleSet(selectedMaterials, setSelectedMaterials, m.id)}
                      disabled={submitting}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {m.description}
                    {!m.has_sale_price && (
                      <div>
                        <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Mangler salgspris
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">{m.supplier_name ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {m.quantity.toLocaleString('da-DK', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">{m.unit}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtKr(m.unit_sales_price)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {fmtKr(m.total_sales_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Øvrige */}
      <Section
        title="Øvrige omkostninger"
        icon={<Receipt className="w-4 h-4 text-purple-600" />}
        rowCount={data.other_costs.length}
        selectedCount={data.other_costs.filter((o) => selectedOtherCosts.has(o.id)).length}
        onToggleAll={() => toggleAll(data.other_costs, selectedOtherCosts, setSelectedOtherCosts)}
      >
        {data.other_costs.length === 0 ? (
          <Empty>Ingen ufakturerede øvrige omkostninger på sagen.</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-2 py-1.5 w-8" />
                <th className="px-2 py-1.5">Dato</th>
                <th className="px-2 py-1.5">Kategori</th>
                <th className="px-2 py-1.5">Beskrivelse</th>
                <th className="px-2 py-1.5 text-right">Antal</th>
                <th className="px-2 py-1.5">Enhed</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.other_costs.map((o) => {
                const cat = o.category as CaseOtherCostCategory
                return (
                  <tr
                    key={o.id}
                    className={`align-top ${!o.has_sale_price ? 'bg-amber-50/40' : ''}`}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedOtherCosts.has(o.id)}
                        onChange={() => toggleSet(selectedOtherCosts, setSelectedOtherCosts, o.id)}
                        disabled={submitting}
                      />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(o.cost_date)}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                          CASE_OTHER_COST_CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {CASE_OTHER_COST_CATEGORY_LABELS[cat] ?? o.category}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {o.description}
                      {o.supplier_name && (
                        <div className="text-[11px] text-gray-500">{o.supplier_name}</div>
                      )}
                      {!o.has_sale_price && (
                        <div>
                          <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                            Mangler salgspris
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {o.quantity.toLocaleString('da-DK', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">{o.unit}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {fmtKr(o.total_sales_price)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Footer: details + totals + submit */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Betalingsfrist (dage)
            </label>
            <input
              type="number"
              min={0}
              max={120}
              value={dueDays}
              onChange={(e) => setDueDays(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
              disabled={submitting}
              className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Forfald = fakturadato + {dueDays} dag{dueDays === 1 ? '' : 'e'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Intern note (valgfri)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              disabled={submitting}
              placeholder="Vises på fakturaen"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm border-t pt-3">
          <Total label="Subtotal (ekskl. moms)" value={fmtKr(totals.subtotal)} />
          <Total label="Moms 25 %" value={fmtKr(totals.vat)} />
          <Total
            label="Total inkl. moms"
            value={fmtKr(totals.final)}
            emphasis
          />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 border-t pt-3">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {totals.count} linje{totals.count === 1 ? '' : 'r'} valgt
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || totals.count === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <FileText className="w-3.5 h-3.5" />
            Opret fakturakladde
          </button>
        </div>

        {submitError && (
          <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <div className="flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {submitError}
            </div>
            {submitSkipped.length > 0 && (
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
                {submitSkipped.slice(0, 5).map((s, i) => (
                  <li key={i} className="font-mono">{s}</li>
                ))}
                {submitSkipped.length > 5 && (
                  <li className="text-red-600">… og {submitSkipped.length - 5} mere</li>
                )}
              </ul>
            )}
          </div>
        )}

        <div className="text-[11px] text-gray-500 flex items-start gap-1 pt-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Fakturaen oprettes som <strong>kladde</strong> (status=draft). PDF + send-mail
            + e-conomic kommer i 6C/6E. Ingen rigtig bogføring sker her.
          </span>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  rowCount,
  selectedCount,
  onToggleAll,
  children,
}: {
  title: string
  icon: React.ReactNode
  rowCount: number
  selectedCount: number
  onToggleAll: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
          <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
            {rowCount}
          </span>
        </h3>
        {rowCount > 0 && (
          <button
            type="button"
            onClick={onToggleAll}
            className="text-xs text-emerald-700 hover:underline"
          >
            {selectedCount === rowCount ? 'Fravælg alle' : 'Vælg alle'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-center text-xs text-gray-500">{children}</div>
  )
}

function Total({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={`tabular-nums ${
          emphasis ? 'text-xl font-bold text-gray-900' : 'text-base font-semibold text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
