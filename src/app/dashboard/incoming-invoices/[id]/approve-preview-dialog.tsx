'use client'

/**
 * Sprint 5E-2 — Approve preview dialog for incoming invoices.
 *
 * Wraps the existing "Godkend" button: instead of approving directly,
 * the operator first sees the faktura-header, sag-link, and a per-line
 * preview of what each fakturalinje would CONVERT to (material /
 * other_cost / skip). The actual conversion to case_materials /
 * case_other_costs lands in Sprint 5E-3 — this dialog is preview +
 * gated approve only.
 *
 * Gate: when matched_case_id is null, the dialog refuses approve and
 * directs the operator to match-the-sag-first.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { X, Loader2, AlertCircle, ExternalLink, ChevronRight } from 'lucide-react'
import type { IncomingInvoiceDetail } from '@/lib/actions/incoming-invoices'
import {
  CASE_OTHER_COST_CATEGORIES,
  CASE_OTHER_COST_CATEGORY_LABELS,
  type CaseOtherCostCategory,
} from '@/types/case-other-costs.types'

export type LineDisposition = 'material' | 'other_cost' | 'skip'

export interface LinePlan {
  lineId: string
  disposition: LineDisposition
  /** Only meaningful when disposition='other_cost'. */
  category: CaseOtherCostCategory
}

const KEYWORDS: Array<{ re: RegExp; category: CaseOtherCostCategory }> = [
  { re: /\bk(ø|o)rsel|transport|udk(ø|o)rsel|kilometer|km\b/i, category: 'koersel' },
  { re: /\bfragt|forsendelse|leveringsgebyr/i,                  category: 'fragt' },
  { re: /\blift|stiger|stillads/i,                              category: 'lift' },
  { re: /\bkran|kranbil/i,                                      category: 'kran' },
  { re: /\bparkering|p-?afgift|p-?gebyr/i,                      category: 'parkering' },
  { re: /\bunderleveran(d|t)|underent|konsulent/i,              category: 'underleverandoer' },
  { re: /\bgebyr|administrationsgebyr|opstartsgebyr|fakturagebyr/i, category: 'gebyr' },
  { re: /\bleje|leje af/i,                                      category: 'lift' }, // generic 'leje' biases to lift
]

function suggestLine(line: {
  description: string | null
  supplier_product_id: string | null
}): { disposition: LineDisposition; category: CaseOtherCostCategory } {
  // 1. Strong material signal: matched supplier product id
  if (line.supplier_product_id) {
    return { disposition: 'material', category: 'andet' }
  }
  // 2. Keyword match → other_cost with picked category
  const desc = line.description ?? ''
  for (const k of KEYWORDS) {
    if (k.re.test(desc)) {
      return { disposition: 'other_cost', category: k.category }
    }
  }
  // 3. Default fallback: other_cost / 'andet' per Sprint 5E-2 spec
  return { disposition: 'other_cost', category: 'andet' }
}

export function ApprovePreviewDialog({
  open,
  detail,
  requireReviewAck,
  busy,
  errorText,
  onClose,
  onConfirm,
  onMatchCase,
}: {
  open: boolean
  detail: IncomingInvoiceDetail
  /** Pass true when the invoice has requires_manual_review=true. */
  requireReviewAck: boolean
  busy: boolean
  errorText: string | null
  onClose: () => void
  /** Sprint 5E-2: server only flips status. plan is preview-only. */
  onConfirm: (plan: LinePlan[]) => void
  /** Open the case picker (used when matched_case_id is null). */
  onMatchCase: () => void
}) {
  const inv = detail.invoice
  const lines = detail.lines

  const [plan, setPlan] = useState<LinePlan[]>([])
  const [reviewAck, setReviewAck] = useState(false)

  // Initial suggestion built whenever the dialog opens. Already-converted
  // lines (Sprint 5E-3) lock to 'skip' so we never re-convert.
  useEffect(() => {
    if (!open) return
    setReviewAck(false)
    setPlan(
      lines.map((l) => {
        if (l.converted_at) {
          return {
            lineId: l.id,
            disposition: 'skip' as LineDisposition,
            category: 'andet',
          }
        }
        const s = suggestLine(l)
        return {
          lineId: l.id,
          disposition: s.disposition,
          category: s.category,
        }
      })
    )
  }, [open, lines])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  const counts = useMemo(() => {
    const c = { material: 0, other_cost: 0, skip: 0 }
    for (const p of plan) c[p.disposition] += 1
    return c
  }, [plan])

  if (!open) return null

  const hasCase = !!detail.case
  const canConfirm =
    hasCase && !busy && (!requireReviewAck || reviewAck)

  const fmtAmount = (n: number | null | undefined) =>
    n == null
      ? '—'
      : new Intl.NumberFormat('da-DK', {
          style: 'currency',
          currency: inv.currency,
          maximumFractionDigits: 2,
        }).format(Number(n))

  const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')

  const updateLine = (lineId: string, patch: Partial<LinePlan>) => {
    setPlan((p) => p.map((row) => (row.lineId === lineId ? { ...row, ...patch } : row)))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-preview-title"
        className="w-full max-w-3xl max-h-full overflow-y-auto rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
          <h2 id="approve-preview-title" className="text-base font-semibold text-gray-900">
            Forhåndsvis godkendelse
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Luk"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Faktura-header summary */}
          <div className="rounded ring-1 ring-gray-200 bg-gray-50 p-3 grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-xs">
            <Field label="Leverandør">
              {detail.supplier?.name ?? inv.supplier_name_extracted ?? '—'}
            </Field>
            <Field label="Fakturanr">
              <span className="font-mono">{inv.invoice_number ?? '—'}</span>
            </Field>
            <Field label="Fakturadato">{fmtDate(inv.invoice_date)}</Field>
            <Field label="Forfald">{fmtDate(inv.due_date)}</Field>
            <Field label="Beløb ekskl. moms">{fmtAmount(inv.amount_excl_vat)}</Field>
            <Field label="Moms">{fmtAmount(inv.vat_amount)}</Field>
            <Field label="Total incl. moms">
              <span className="font-semibold">{fmtAmount(inv.amount_incl_vat)}</span>
            </Field>
          </div>

          {/* Sag-status */}
          {hasCase && detail.case ? (
            <div className="rounded ring-1 ring-emerald-200 bg-emerald-50 px-3 py-2 text-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-emerald-700">
                  Tilknyttet sag
                </div>
                <Link
                  href={`/dashboard/orders/${detail.case.case_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-900 hover:underline inline-flex items-center gap-1"
                >
                  <span className="font-mono text-xs">{detail.case.case_number}</span>
                  <span className="font-medium">{detail.case.project_name || detail.case.title}</span>
                  {detail.case.customer_name && (
                    <span className="text-emerald-700">· {detail.case.customer_name}</span>
                  )}
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded ring-1 ring-amber-300 bg-amber-50 px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-amber-900">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Match fakturaen til en sag før godkendelse</div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    En leverandørfaktura skal være knyttet til en service_case for at den kan godkendes
                    og senere konverteres til materiale-/omkostningslinjer på sagen.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onMatchCase}
                disabled={busy}
                className="text-xs px-2 py-1 rounded ring-1 ring-amber-400 bg-white text-amber-900 hover:bg-amber-100 whitespace-nowrap disabled:opacity-60"
              >
                Match til sag
              </button>
            </div>
          )}

          {/* Linjer preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold text-gray-900">
                Fakturalinjer ({lines.length})
              </h3>
              <div className="text-[11px] text-gray-500 flex items-center gap-3">
                <span>Materiale: <strong className="text-blue-700">{counts.material}</strong></span>
                <span>Øvrige: <strong className="text-purple-700">{counts.other_cost}</strong></span>
                <span>Spring over: <strong className="text-gray-600">{counts.skip}</strong></span>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="rounded ring-1 ring-gray-200 bg-white p-4 text-xs text-gray-500 text-center">
                Ingen linjer ekstraheret. Godkendelse vil kun flippe status — ingen konvertering.
              </div>
            ) : (
              <div className="rounded ring-1 ring-gray-200 bg-white overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-2 py-1.5 w-8">#</th>
                      <th className="px-2 py-1.5">Beskrivelse</th>
                      <th className="px-2 py-1.5 text-right w-16">Antal</th>
                      <th className="px-2 py-1.5 w-12">Enhed</th>
                      <th className="px-2 py-1.5 text-right w-24">Total</th>
                      <th className="px-2 py-1.5 w-44">Konvertér til</th>
                      <th className="px-2 py-1.5 w-40">Kategori</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l) => {
                      const row = plan.find((p) => p.lineId === l.id)
                      const disposition = row?.disposition ?? 'skip'
                      const category = row?.category ?? 'andet'
                      const alreadyConverted = !!l.converted_at
                      const convertedAs = l.converted_case_material_id
                        ? 'material'
                        : l.converted_case_other_cost_id
                        ? 'other_cost'
                        : null
                      return (
                        <tr key={l.id} className={`align-top ${alreadyConverted ? 'bg-gray-50' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-500">{l.line_number}</td>
                          <td className="px-2 py-1.5">
                            <div className={alreadyConverted ? 'text-gray-500 line-through' : 'text-gray-900'}>
                              {l.description ?? '—'}
                            </div>
                            {l.supplier_product_id && !alreadyConverted && (
                              <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                Matched produkt
                              </span>
                            )}
                            {alreadyConverted && (
                              <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                {convertedAs === 'material'
                                  ? 'Allerede konverteret · Materiale'
                                  : convertedAs === 'other_cost'
                                  ? 'Allerede konverteret · Øvrig'
                                  : 'Allerede behandlet · Sprunget over'}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {l.quantity ?? '—'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600">{l.unit ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                            {fmtAmount(l.total_price)}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={disposition}
                              onChange={(e) =>
                                updateLine(l.id, {
                                  disposition: e.target.value as LineDisposition,
                                })
                              }
                              disabled={busy || alreadyConverted}
                              className={`w-full border rounded px-1.5 py-1 text-xs bg-white ${
                                alreadyConverted
                                  ? 'text-gray-400'
                                  : disposition === 'material'
                                  ? 'ring-1 ring-blue-200'
                                  : disposition === 'other_cost'
                                  ? 'ring-1 ring-purple-200'
                                  : 'text-gray-500'
                              } disabled:opacity-60`}
                            >
                              <option value="material">Materiale</option>
                              <option value="other_cost">Øvrig omkostning</option>
                              <option value="skip">Spring over</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            {disposition === 'other_cost' && !alreadyConverted ? (
                              <select
                                value={category}
                                onChange={(e) =>
                                  updateLine(l.id, {
                                    category: e.target.value as CaseOtherCostCategory,
                                  })
                                }
                                disabled={busy}
                                className="w-full border rounded px-1.5 py-1 text-xs bg-white"
                              >
                                {CASE_OTHER_COST_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {CASE_OTHER_COST_CATEGORY_LABELS[c]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              Forhåndsvis kun. Selve konvertering til
              <code className="px-1 bg-gray-100 rounded font-mono">case_materials</code>
              /
              <code className="px-1 bg-gray-100 rounded font-mono">case_other_costs</code>
              kommer i Sprint 5E-3.
            </p>
          </div>

          {/* Manual review acknowledgment */}
          {requireReviewAck && (
            <label className="flex items-start gap-2 text-sm bg-amber-50 ring-1 ring-amber-200 p-3 rounded">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={reviewAck}
                onChange={(e) => setReviewAck(e.target.checked)}
              />
              <span>
                <span className="font-medium">Jeg bekræfter</span> at jeg har gennemgået fakturaen
                manuelt og at felterne er korrekte.
              </span>
            </label>
          )}

          {errorText && (
            <div className="rounded ring-1 ring-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {errorText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t bg-gray-50 px-4 py-2.5 rounded-b-lg sticky bottom-0">
          <div className="text-[11px] text-gray-500">
            {hasCase
              ? 'Klik "Godkend" for at flippe status til approved.'
              : 'Match til sag for at fortsætte.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-100 disabled:opacity-60"
            >
              Annullér
            </button>
            <button
              type="button"
              onClick={() => onConfirm(plan)}
              disabled={!canConfirm}
              className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Godkend
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  )
}
