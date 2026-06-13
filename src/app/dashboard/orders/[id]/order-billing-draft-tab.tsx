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

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, Clock, FileText, Info, Loader2, Package, Receipt,
  TrendingUp, Percent, FileCheck2, ListChecks, Wallet, ExternalLink,
} from 'lucide-react'
import {
  createFinalInvoiceAction,
  createInvoiceDraftFromCaseAction,
  createStageInvoiceAction,
  listStageInvoicesForCaseAction,
  listUnbilledForCaseAction,
  type UnbilledForCase,
} from '@/lib/actions/invoices'
import {
  CASE_OTHER_COST_CATEGORY_COLORS,
  CASE_OTHER_COST_CATEGORY_LABELS,
  type CaseOtherCostCategory,
} from '@/types/case-other-costs.types'
import { formatCurrency } from '@/lib/utils/format'
import type { StageInvoiceSummary } from '@/lib/services/invoice-stage'
import { CaseInvoiceHistory } from '@/components/modules/orders/case-invoice-history'

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

// =====================================================
// 6D-3 — Top-level wrapper med mode-vælger + StageOverview
// =====================================================

type BillingMode = 'standard' | 'deposit' | 'progress' | 'final'

export function OrderBillingDraftTab({ caseId }: { caseId: string }) {
  const [mode, setMode] = useState<BillingMode>('standard')
  const [stageReloadKey, setStageReloadKey] = useState(0)

  return (
    <div className="space-y-4">
      {/* Type-vælger */}
      <BillingModeSelector mode={mode} onChange={setMode} />

      {/* Stage invoices oversigt — altid synlig */}
      <StageInvoicesOverview caseId={caseId} reloadKey={stageReloadKey} />

      {/* Mode-specifikt UI */}
      {mode === 'standard' && <BillingStandardMode caseId={caseId} />}
      {(mode === 'deposit' || mode === 'progress') && (
        <BillingPercentMode
          caseId={caseId}
          mode={mode}
          onCreated={() => setStageReloadKey((k) => k + 1)}
        />
      )}
      {mode === 'final' && (
        <BillingFinalMode
          caseId={caseId}
          onCreated={() => setStageReloadKey((k) => k + 1)}
        />
      )}

      {/* Sprint Ø3.3 — cost-free fakturahistorik (oprettet/slettet/krediteret) */}
      <CaseInvoiceHistory caseId={caseId} />
    </div>
  )
}

function BillingModeSelector({
  mode,
  onChange,
}: {
  mode: BillingMode
  onChange: (m: BillingMode) => void
}) {
  const opts: Array<{
    key: BillingMode
    label: string
    icon: React.ReactNode
    color: string
    desc: string
  }> = [
    {
      key: 'standard',
      label: 'Almindelig',
      icon: <ListChecks className="w-4 h-4" />,
      color: 'emerald',
      desc: 'Vælg ufakturerede timer/materialer/øvrige',
    },
    {
      key: 'deposit',
      label: 'Forskud',
      icon: <Wallet className="w-4 h-4" />,
      color: 'blue',
      desc: 'Procent af kontraktsum, før forbrug',
    },
    {
      key: 'progress',
      label: 'Rate',
      icon: <Percent className="w-4 h-4" />,
      color: 'purple',
      desc: 'Procent under forbrug (a conto)',
    },
    {
      key: 'final',
      label: 'Slutfaktura',
      icon: <FileCheck2 className="w-4 h-4" />,
      color: 'orange',
      desc: 'Resterende minus tidligere forskud/rater',
    },
  ]
  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        Fakturatype
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {opts.map((o) => {
          const active = mode === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={`text-left rounded-lg px-3 py-2 ring-1 transition ${
                active
                  ? `bg-${o.color}-50 ring-${o.color}-300 text-${o.color}-900`
                  : 'bg-white ring-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {o.icon}
                {o.label}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{o.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// =====================================================
// Stage invoices overview — altid synlig
// =====================================================

function StageInvoicesOverview({
  caseId,
  reloadKey,
}: {
  caseId: string
  reloadKey: number
}) {
  const [rows, setRows] = useState<StageInvoiceSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    listStageInvoicesForCaseAction(caseId).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setError(res.message ?? 'Kunne ikke hente stage-fakturaer')
        setRows([])
        return
      }
      setRows(res.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [caseId, reloadKey])

  if (rows === null && !error) return null
  if (error) {
    return (
      <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5" /> {error}
      </div>
    )
  }
  if (!rows || rows.length === 0) return null

  const cumulativePct = rows
    .filter((r) => r.invoice_type !== 'final')
    .reduce((s, r) => s + (r.billing_percentage ?? 0), 0)

  const hasFinal = rows.some((r) => r.is_final_invoice)

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          Stage-fakturaer på sagen
          <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
            {rows.length}
          </span>
        </h3>
        {!hasFinal && cumulativePct > 0 && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded ${
              cumulativePct >= 100
                ? 'bg-red-100 text-red-800'
                : cumulativePct >= 80
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            Akkumuleret forskud/rate: {fmtPct(cumulativePct)}
          </span>
        )}
        {hasFinal && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-orange-100 text-orange-800">
            Slutfaktura findes
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-2 py-1.5">Nr</th>
              <th className="px-2 py-1.5">Type</th>
              <th className="px-2 py-1.5">Label</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5 text-right">Procent</th>
              <th className="px-2 py-1.5 text-right">Subtotal</th>
              <th className="px-2 py-1.5 text-right">Total inkl. moms</th>
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1.5 font-mono">{r.invoice_number}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                      r.invoice_type === 'deposit'
                        ? 'bg-blue-100 text-blue-800'
                        : r.invoice_type === 'progress'
                        ? 'bg-purple-100 text-purple-800'
                        : r.invoice_type === 'final'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {r.invoice_type === 'deposit'
                      ? 'Forskud'
                      : r.invoice_type === 'progress'
                      ? 'Rate'
                      : r.invoice_type === 'final'
                      ? 'Slut'
                      : r.invoice_type}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-700">{r.stage_label ?? '—'}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                      r.status === 'draft'
                        ? 'bg-gray-100 text-gray-700'
                        : r.status === 'sent'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.billing_percentage == null ? '—' : fmtPct(r.billing_percentage)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtKr(r.total_amount)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                  {fmtKr(r.final_amount)}
                </td>
                <td className="px-2 py-1.5">
                  <Link
                    href={`/dashboard/invoices/${r.id}`}
                    className="inline-flex items-center text-emerald-700 hover:text-emerald-900"
                    aria-label="Åbn faktura"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =====================================================
// Percent mode — forskud + rate
// =====================================================

function BillingPercentMode({
  caseId,
  mode,
  onCreated,
}: {
  caseId: string
  mode: 'deposit' | 'progress'
  onCreated: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [contractSum, setContractSum] = useState<number | null>(null)
  const [revisedSum, setRevisedSum] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [cumulativePct, setCumulativePct] = useState(0)
  const [hasFinal, setHasFinal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [basis, setBasis] = useState<'contract_sum' | 'revised_sum'>('contract_sum')
  const [percent, setPercent] = useState<string>('30')
  const [stageLabel, setStageLabel] = useState<string>('')
  const [dueDays, setDueDays] = useState<number>(14)
  const [notes, setNotes] = useState<string>('')
  const [allowOver, setAllowOver] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      listUnbilledForCaseAction(caseId),
      listStageInvoicesForCaseAction(caseId),
    ]).then(([uRes, sRes]) => {
      if (cancelled) return
      setLoading(false)
      if (!uRes.ok || !uRes.data) {
        setLoadError(uRes.message ?? 'Kunne ikke hente sag')
        return
      }
      // listUnbilledForCaseAction returnerer nu også contract_sum +
      // revised_sum (Sprint 6D-3 udvidelse), så ingen separat fetch.
      setCustomerName(uRes.data.customer_name ?? null)
      setContractSum(uRes.data.contract_sum)
      setRevisedSum(uRes.data.revised_sum)
      // Default basis: revised hvis sat, ellers contract
      if (uRes.data.revised_sum != null && uRes.data.revised_sum > 0) {
        setBasis('revised_sum')
      }
      if (sRes.ok && sRes.data) {
        const stages = sRes.data
        setHasFinal(stages.some((s) => s.is_final_invoice))
        setCumulativePct(
          stages
            .filter((s) => s.invoice_type !== 'final')
            .reduce((sum, s) => sum + (s.billing_percentage ?? 0), 0)
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [caseId])

  const basisValue =
    basis === 'contract_sum' ? contractSum : revisedSum

  const pctNum = useMemo(() => {
    const n = Number(String(percent).replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }, [percent])

  const live = useMemo(() => {
    if (!basisValue || !pctNum || pctNum <= 0) {
      return { subtotal: 0, vat: 0, final: 0, ok: false }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100
    const subtotal = r2(basisValue * (pctNum / 100))
    const vat = r2(subtotal * VAT_RATE)
    return { subtotal, vat, final: r2(subtotal + vat), ok: true }
  }, [basisValue, pctNum])

  const cumulativeAfter = cumulativePct + (Number.isFinite(pctNum) ? pctNum : 0)
  const overBudget = cumulativeAfter > 100

  const handleSubmit = async () => {
    setSubmitError(null)
    if (!live.ok) {
      setSubmitError('Indtast en gyldig procent (>0 og ≤100)')
      return
    }
    if (basisValue == null) {
      setSubmitError(
        basis === 'contract_sum'
          ? 'Sagen mangler kontraktsum'
          : 'Sagen mangler revideret beløb'
      )
      return
    }
    if (overBudget && !allowOver) {
      setSubmitError(
        `Akkumuleret rate ville blive ${fmtPct(cumulativeAfter)}. Sæt "Tillad >100 %" hvis du virkelig vil.`
      )
      return
    }
    setSubmitting(true)
    const res = await createStageInvoiceAction({
      case_id: caseId,
      invoice_type: mode,
      amount_basis: basis,
      billing_percentage: pctNum,
      stage_label: stageLabel.trim() || null,
      due_days: dueDays,
      notes: notes.trim() || null,
      allow_over: allowOver,
    })
    setSubmitting(false)
    if (!res.ok || !res.invoice_id) {
      setSubmitError(res.message)
      return
    }
    onCreated()
    startTransition(() => router.push(`/dashboard/invoices/${res.invoice_id}`))
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-8 text-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-400" />
        Henter sag-data…
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        {loadError}
      </div>
    )
  }

  if (hasFinal) {
    return (
      <div className="rounded-lg ring-1 ring-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>Slutfaktura findes allerede på sagen.</strong> Forskud og rater
          kan ikke oprettes når sagen er afsluttet. Slet slutfakturaen først hvis
          du vil tilføje endnu en delfaktura.
        </div>
      </div>
    )
  }

  const noBasis = basisValue == null || basisValue <= 0
  const defaultLabel =
    mode === 'deposit'
      ? 'Forskud'
      : (() => {
          // Naive count → operatør kan ændre. Ikke kritisk præcis.
          return 'Rate'
        })()

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'deposit' ? 'Forskudsfaktura' : 'Ratefaktura'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Procent af{' '}
            {basis === 'contract_sum' ? 'kontraktsum' : 'revideret beløb'} —
            ingen kobling til ufakturerede timer/materialer/øvrige.
          </p>
        </div>
        {customerName && (
          <div className="text-right text-xs text-gray-600">
            Kunde: <strong className="text-gray-900">{customerName}</strong>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Beregningsgrundlag
            </label>
            <div className="flex gap-2">
              <label
                className={`flex-1 cursor-pointer rounded ring-1 px-2 py-1.5 text-xs ${
                  basis === 'contract_sum'
                    ? 'bg-emerald-50 ring-emerald-300 text-emerald-900'
                    : 'bg-white ring-gray-200 text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="basis"
                  className="mr-1.5"
                  checked={basis === 'contract_sum'}
                  onChange={() => setBasis('contract_sum')}
                  disabled={submitting}
                />
                Kontraktsum
                <span className="ml-1 tabular-nums">
                  {contractSum == null ? '(tom)' : fmtKr(contractSum)}
                </span>
              </label>
              <label
                className={`flex-1 cursor-pointer rounded ring-1 px-2 py-1.5 text-xs ${
                  basis === 'revised_sum'
                    ? 'bg-emerald-50 ring-emerald-300 text-emerald-900'
                    : 'bg-white ring-gray-200 text-gray-700'
                } ${revisedSum == null ? 'opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="basis"
                  className="mr-1.5"
                  checked={basis === 'revised_sum'}
                  onChange={() => revisedSum != null && setBasis('revised_sum')}
                  disabled={submitting || revisedSum == null}
                />
                Revideret
                <span className="ml-1 tabular-nums">
                  {revisedSum == null ? '(tom)' : fmtKr(revisedSum)}
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Procent (%) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              disabled={submitting}
              className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Akkumuleret forskud/rate efter denne: <strong>{fmtPct(cumulativeAfter)}</strong>
              {overBudget && (
                <span className="text-red-700 ml-1">— over 100 %!</span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Stage label
            </label>
            <input
              type="text"
              value={stageLabel}
              onChange={(e) => setStageLabel(e.target.value)}
              maxLength={120}
              disabled={submitting}
              placeholder={`Default: "${defaultLabel}"`}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Betalingsfrist (dage)
            </label>
            <input
              type="number"
              min={0}
              max={120}
              value={dueDays}
              onChange={(e) =>
                setDueDays(Math.max(0, Math.min(120, Number(e.target.value) || 0)))
              }
              disabled={submitting}
              className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
            />
          </div>

          <div className="sm:col-span-2">
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

        {/* Live preview */}
        <div className="rounded ring-1 ring-gray-200 bg-gray-50 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Total
            label="Basis"
            value={basisValue == null ? '—' : fmtKr(basisValue)}
          />
          <Total label="Procent" value={fmtPct(pctNum, 2)} />
          <Total label="Subtotal (ekskl. moms)" value={fmtKr(live.subtotal)} />
          <Total label="Total inkl. moms" value={fmtKr(live.final)} emphasis />
        </div>

        {noBasis && (
          <div className="rounded ring-1 ring-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            {basis === 'contract_sum'
              ? 'Sagen mangler kontraktsum (contract_sum). Sæt den på sagens overblik først.'
              : 'Sagen mangler revideret beløb (revised_sum).'}
          </div>
        )}

        {overBudget && (
          <label className="flex items-start gap-2 text-xs bg-red-50 ring-1 ring-red-200 p-2 rounded">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={allowOver}
              onChange={(e) => setAllowOver(e.target.checked)}
              disabled={submitting}
            />
            <span className="text-red-900">
              Bekræft: jeg vil acceptere akkumuleret faktureret &gt;100 %.
            </span>
          </label>
        )}

        {submitError && (
          <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {submitError}
          </div>
        )}

        <div className="flex justify-end border-t pt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || noBasis || !live.ok || (overBudget && !allowOver)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <FileText className="w-3.5 h-3.5" />
            Opret {mode === 'deposit' ? 'forskudsfaktura' : 'ratefaktura'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Final mode — slutfaktura med fradrag
// =====================================================

function BillingFinalMode({
  caseId,
  onCreated,
}: {
  caseId: string
  onCreated: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [stages, setStages] = useState<StageInvoiceSummary[] | null>(null)
  const [unbilled, setUnbilled] = useState<UnbilledForCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [includeLines, setIncludeLines] = useState(true)
  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      listStageInvoicesForCaseAction(caseId),
      listUnbilledForCaseAction(caseId),
    ]).then(([sRes, uRes]) => {
      if (cancelled) return
      setLoading(false)
      if (!sRes.ok) {
        setLoadError(sRes.message ?? 'Kunne ikke hente stage-fakturaer')
        return
      }
      setStages(sRes.data ?? [])
      if (uRes.ok && uRes.data) setUnbilled(uRes.data)
    })
    return () => {
      cancelled = true
    }
  }, [caseId])

  if (loading) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-8 text-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-400" />
        Henter sag-data…
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
        {loadError}
      </div>
    )
  }

  const predecessors = (stages ?? []).filter(
    (s) => s.invoice_type === 'deposit' || s.invoice_type === 'progress'
  )
  const existingFinal = (stages ?? []).find((s) => s.is_final_invoice)
  const deductionTotal = predecessors.reduce((sum, p) => sum + Number(p.total_amount), 0)

  const positiveSubtotal = (() => {
    if (!unbilled || !includeLines) return 0
    let s = 0
    for (const t of unbilled.time_logs) if (t.has_rate) s += t.total_sales_price
    for (const m of unbilled.materials) if (m.has_sale_price) s += m.total_sales_price
    for (const o of unbilled.other_costs) if (o.has_sale_price) s += o.total_sales_price
    return Math.round(s * 100) / 100
  })()

  const r2 = (n: number) => Math.round(n * 100) / 100
  const subtotal = r2(positiveSubtotal - deductionTotal)
  const vat = r2(subtotal * VAT_RATE)
  const finalAmount = r2(subtotal + vat)

  const noLines =
    !includeLines && predecessors.length === 0 && positiveSubtotal === 0
  const onlyDeductions = positiveSubtotal === 0 && deductionTotal > 0

  const handleSubmit = async () => {
    setSubmitError(null)
    if (existingFinal) {
      setSubmitError('Slutfaktura findes allerede')
      return
    }
    if (noLines) {
      setSubmitError('Ingen linjer at oprette — slutfaktura ville være tom')
      return
    }
    setSubmitting(true)
    const res = await createFinalInvoiceAction({
      case_id: caseId,
      include_unbilled_lines: includeLines,
      due_days: dueDays,
      notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (!res.ok || !res.invoice_id) {
      setSubmitError(res.message)
      return
    }
    onCreated()
    startTransition(() => router.push(`/dashboard/invoices/${res.invoice_id}`))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Slutfaktura</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Resterende ufakturerede linjer minus fradrag for tidligere forskud/rater.
          Når oprettet, kan tidligere forskud/rater ikke længere ændres.
        </p>
      </div>

      {existingFinal && (
        <div className="rounded ring-1 ring-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Slutfaktura findes allerede på sagen.</strong> Faktura{' '}
            <Link
              href={`/dashboard/invoices/${existingFinal.id}`}
              className="font-mono text-amber-900 underline"
            >
              {existingFinal.invoice_number}
            </Link>{' '}
            er status <code>{existingFinal.status}</code>. Slet den først hvis du
            vil oprette en ny.
          </div>
        </div>
      )}

      {/* Forgængere */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-gray-500" />
          Forgængere der fratrækkes
          <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
            {predecessors.length}
          </span>
        </h3>
        {predecessors.length === 0 ? (
          <p className="text-xs text-gray-500">
            Ingen tidligere forskud eller rater på sagen — slutfakturaen vil bare
            være de ufakturerede linjer.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Nr</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Label</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5 text-right">Procent</th>
                  <th className="px-2 py-1.5 text-right">Fradrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {predecessors.map((p) => (
                  <tr key={p.id}>
                    <td className="px-2 py-1.5 font-mono">
                      <Link
                        href={`/dashboard/invoices/${p.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {p.invoice_number}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">
                      {p.invoice_type === 'deposit' ? 'Forskud' : 'Rate'}
                    </td>
                    <td className="px-2 py-1.5 text-gray-700">{p.stage_label ?? '—'}</td>
                    <td className="px-2 py-1.5">{p.status}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p.billing_percentage == null ? '—' : fmtPct(p.billing_percentage)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-red-700">
                      −{fmtKr(p.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-gray-600">
                    Total fradrag (ekskl. moms)
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold text-red-700">
                    −{fmtKr(deductionTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 space-y-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeLines}
            onChange={(e) => setIncludeLines(e.target.checked)}
            disabled={submitting || !!existingFinal}
            className="mt-0.5"
          />
          <span>
            Inkludér ufakturerede linjer (timer + materialer + øvrige) som positive
            linjer på slutfakturaen.
            {unbilled && (
              <span className="text-xs text-gray-500 ml-1">
                ({unbilled.time_logs.length + unbilled.materials.length + unbilled.other_costs.length}{' '}
                ufakturerede rækker · {fmtKr(positiveSubtotal)})
              </span>
            )}
          </span>
        </label>

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
              onChange={(e) =>
                setDueDays(Math.max(0, Math.min(120, Number(e.target.value) || 0)))
              }
              disabled={submitting || !!existingFinal}
              className="w-full border rounded px-2 py-1.5 text-sm tabular-nums"
            />
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
              disabled={submitting || !!existingFinal}
              placeholder="Vises på fakturaen"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded ring-1 ring-gray-200 bg-gray-50 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Total label="Linjer" value={fmtKr(positiveSubtotal)} />
          <Total label="Fradrag" value={`−${fmtKr(deductionTotal)}`} />
          <Total label="Subtotal" value={fmtKr(subtotal)} />
          <Total label="Total inkl. moms" value={fmtKr(finalAmount)} emphasis />
        </div>

        {onlyDeductions && (
          <div className="rounded ring-1 ring-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Kun fradrag, ingen positive linjer.</strong> Slutfakturaen
            bliver negativ — kunden har overbetalt. Overvej kreditnota i Sprint 6F
            i stedet.
          </div>
        )}

        {submitError && (
          <div className="rounded ring-1 ring-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {submitError}
          </div>
        )}

        <div className="flex justify-end border-t pt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !!existingFinal || noLines}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <FileCheck2 className="w-3.5 h-3.5" />
            Opret slutfaktura
          </button>
        </div>
      </div>
    </div>
  )
}

export function BillingStandardMode({ caseId }: { caseId: string }) {
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
