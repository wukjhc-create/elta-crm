'use client'

/**
 * Sprint 5C — Øvrige omkostninger-tab on /dashboard/orders/[id].
 *
 * Lists all case_other_costs on the sag with category pill, summary
 * footer (cost / sale / DB / DB%), and add/edit/delete. Snapshot
 * pricing — no live catalog lookup.
 */

import { useEffect, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, Receipt, Paperclip,
} from 'lucide-react'
import {
  listCaseOtherCosts,
  deleteCaseOtherCost,
} from '@/lib/actions/case-other-costs'
import {
  CASE_OTHER_COST_CATEGORY_LABELS,
  CASE_OTHER_COST_CATEGORY_COLORS,
  type CaseOtherCostRow,
  type CaseOtherCostsSummary,
} from '@/types/case-other-costs.types'
import { formatCurrency } from '@/lib/utils/format'
import { CaseOtherCostDialog } from './case-other-cost-dialog'

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manuel',
  time_log: 'Timelog',
  supplier_invoice: 'Lev.faktura',
}

function fmtNum(n: number, decimals = 2): string {
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtPct(n: number): string {
  return `${new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)} %`
}

function fmtDate(s: string): string {
  if (!s) return '—'
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function OrderOtherCostsTab({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [rows, setRows] = useState<CaseOtherCostRow[] | null>(null)
  const [summary, setSummary] = useState<CaseOtherCostsSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CaseOtherCostRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoadError(null)
    const res = await listCaseOtherCosts(caseId)
    if (!res.success) {
      setLoadError(res.error ?? 'Kunne ikke hente øvrige omkostninger')
      setRows([])
      setSummary(null)
      return
    }
    setRows(res.data?.rows ?? [])
    setSummary(res.data?.summary ?? null)
  }, [caseId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleDelete = async (row: CaseOtherCostRow) => {
    if (row.invoice_line_id) {
      setActionError('Omkostningen er faktureret og kan ikke slettes')
      return
    }
    if (!window.confirm(`Slet "${row.description}"?`)) return
    setActionError(null)
    setDeletingId(row.id)
    const res = await deleteCaseOtherCost(row.id)
    setDeletingId(null)
    if (!res.success) {
      setActionError(res.error ?? 'Kunne ikke slette')
      return
    }
    await reload()
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Øvrige omkostninger</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Kørsel, leje, underleverandør, fragt m.m. Snapshot-priser — ændringer påvirker ikke historik.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Tilføj omkostning
        </button>
      </div>

      {loadError && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {loadError}
        </div>
      )}

      {actionError && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {actionError}
          <button
            onClick={() => setActionError(null)}
            className="ml-auto text-xs text-red-700 hover:underline"
          >
            Luk
          </button>
        </div>
      )}

      {/* Loading */}
      {rows === null && !loadError && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 p-8 text-center text-sm text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-400" />
          Henter omkostninger…
        </div>
      )}

      {/* Empty state */}
      {rows !== null && rows.length === 0 && !loadError && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 py-12 px-6 text-center">
          <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-700">
            Ingen øvrige omkostninger registreret
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Når der bookes kørsel, leje, fragt eller andre omkostninger på sagen,
            vises de her med kost- og salgspris.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            className="mt-4 inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Tilføj første omkostning
          </button>
        </div>
      )}

      {/* Table */}
      {rows && rows.length > 0 && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Dato</th>
                <th className="px-2 py-2 text-left">Kategori</th>
                <th className="px-3 py-2 text-left">Beskrivelse</th>
                <th className="px-2 py-2 text-left">Leverandør</th>
                <th className="px-2 py-2 text-right">Antal</th>
                <th className="px-2 py-2 text-left">Enhed</th>
                <th className="px-2 py-2 text-right">Kostpris</th>
                <th className="px-2 py-2 text-right">Salgspris</th>
                <th className="px-2 py-2 text-right">Sum kost</th>
                <th className="px-2 py-2 text-right">Sum salg</th>
                <th className="px-2 py-2 text-center w-20">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const isLocked = !!r.invoice_line_id
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">
                      {fmtDate(r.cost_date)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                          CASE_OTHER_COST_CATEGORY_COLORS[r.category]
                        }`}
                      >
                        {CASE_OTHER_COST_CATEGORY_LABELS[r.category]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{r.description}</div>
                      {r.notes && (
                        <div className="text-[11px] text-gray-500 truncate max-w-[260px]">
                          {r.notes}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {isLocked && (
                          <span className="inline-block text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                            Faktureret
                          </span>
                        )}
                        {!r.billable && (
                          <span className="inline-block text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            Ikke faktura
                          </span>
                        )}
                        {r.receipt_url && (
                          <a
                            href={r.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-200"
                            title={r.receipt_filename ?? 'Åbn bilag'}
                          >
                            <Paperclip className="w-2.5 h-2.5" />
                            Bilag
                          </a>
                        )}
                        {r.source !== 'manual' && (
                          <span className="inline-block text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {SOURCE_LABEL[r.source] ?? r.source}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {r.supplier_name ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(r.quantity, 2)}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">{r.unit}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatCurrency(r.unit_cost, 'DKK', 2)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatCurrency(r.unit_sales_price, 'DKK', 2)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(r.total_cost, 'DKK', 2)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(r.total_sales_price, 'DKK', 2)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(r)
                            setDialogOpen(true)
                          }}
                          disabled={isLocked}
                          aria-label="Rediger omkostning"
                          className="p-1 rounded hover:bg-emerald-100 text-emerald-700 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          disabled={isLocked || deletingId === r.id}
                          aria-label="Slet omkostning"
                          className="p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {summary && (
              <tfoot className="bg-gray-50 text-sm">
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={8} className="px-3 py-2 text-right text-xs text-gray-600 uppercase tracking-wide">
                    Total ({summary.count} {summary.count === 1 ? 'linje' : 'linjer'})
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(summary.total_cost, 'DKK', 2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(summary.total_sales_price, 'DKK', 2)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={8} className="px-3 py-1 text-right text-xs text-gray-600 uppercase tracking-wide">
                    Foreløbig DB
                  </td>
                  <td colSpan={2} className="px-2 py-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`tabular-nums font-semibold ${
                          summary.contribution_margin >= 0
                            ? 'text-emerald-700'
                            : 'text-red-700'
                        }`}
                      >
                        {formatCurrency(summary.contribution_margin, 'DKK', 2)}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          summary.margin_percentage >= 25
                            ? 'bg-emerald-100 text-emerald-800'
                            : summary.margin_percentage >= 10
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {fmtPct(summary.margin_percentage)}
                      </span>
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <CaseOtherCostDialog
        open={dialogOpen}
        caseId={caseId}
        editing={editing}
        onClose={() => {
          setDialogOpen(false)
          setEditing(null)
        }}
        onSaved={async () => {
          setDialogOpen(false)
          setEditing(null)
          await reload()
          startTransition(() => router.refresh())
        }}
      />
    </div>
  )
}
