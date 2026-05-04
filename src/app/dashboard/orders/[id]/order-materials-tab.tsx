'use client'

/**
 * Sprint 5B — Materialer-tab on /dashboard/orders/[id].
 *
 * Lists all case_materials on the sag, with summary footer (total cost,
 * total sale, contribution margin, margin %), and lets the operator
 * add / edit / delete rows. Snapshot prices — no live catalog lookup
 * happens here.
 */

import { useEffect, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, PackageOpen,
} from 'lucide-react'
import {
  listCaseMaterials,
  deleteCaseMaterial,
} from '@/lib/actions/case-materials'
import type {
  CaseMaterialRow,
  CaseMaterialsSummary,
} from '@/types/case-materials.types'
import { formatCurrency } from '@/lib/utils/format'
import { CaseMaterialDialog } from './case-material-dialog'

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manuel',
  offer: 'Tilbud',
  supplier_invoice: 'Lev.faktura',
  calculator: 'Kalkulation',
}

const SOURCE_COLOR: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-700',
  offer: 'bg-purple-100 text-purple-700',
  supplier_invoice: 'bg-blue-100 text-blue-700',
  calculator: 'bg-emerald-100 text-emerald-700',
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

export function OrderMaterialsTab({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [rows, setRows] = useState<CaseMaterialRow[] | null>(null)
  const [summary, setSummary] = useState<CaseMaterialsSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CaseMaterialRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoadError(null)
    const res = await listCaseMaterials(caseId)
    if (!res.success) {
      setLoadError(res.error ?? 'Kunne ikke hente materialer')
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

  const handleDelete = async (row: CaseMaterialRow) => {
    if (row.invoice_line_id) {
      setActionError('Materialet er faktureret og kan ikke slettes')
      return
    }
    if (!window.confirm(`Slet "${row.description}"?`)) return
    setActionError(null)
    setDeletingId(row.id)
    const res = await deleteCaseMaterial(row.id)
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
          <h2 className="text-lg font-semibold text-gray-900">Materialer på sagen</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Faktisk forbrug. Snapshot-priser — ændringer i katalog påvirker ikke historik.
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
          Tilføj materiale
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
          Henter materialer…
        </div>
      )}

      {/* Empty state */}
      {rows !== null && rows.length === 0 && !loadError && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 py-12 px-6 text-center">
          <PackageOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-700">
            Ingen materialer registreret
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Når der bookes en vare på sagen, vises kost- og salgspris her med
            samlet DB-beregning.
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
            Tilføj første materiale
          </button>
        </div>
      )}

      {/* Table */}
      {rows && rows.length > 0 && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Beskrivelse</th>
                <th className="px-2 py-2 text-left">SKU</th>
                <th className="px-2 py-2 text-left">Leverandør</th>
                <th className="px-2 py-2 text-right">Antal</th>
                <th className="px-2 py-2 text-left">Enhed</th>
                <th className="px-2 py-2 text-right">Kostpris</th>
                <th className="px-2 py-2 text-right">Salgspris</th>
                <th className="px-2 py-2 text-right">Sum kost</th>
                <th className="px-2 py-2 text-right">Sum salg</th>
                <th className="px-2 py-2 text-center">Kilde</th>
                <th className="px-2 py-2 text-center w-20">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const isLocked = !!r.invoice_line_id
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{r.description}</div>
                      {r.notes && (
                        <div className="text-[11px] text-gray-500 truncate max-w-[260px]">
                          {r.notes}
                        </div>
                      )}
                      {isLocked && (
                        <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Faktureret
                        </span>
                      )}
                      {!r.billable && (
                        <span className="inline-block mt-0.5 ml-1 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          Ikke faktura
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600 font-mono">
                      {r.sku_snapshot ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {r.supplier_name_snapshot ?? '—'}
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
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                          SOURCE_COLOR[r.source] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {SOURCE_LABEL[r.source] ?? r.source}
                      </span>
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
                          aria-label="Rediger materiale"
                          className="p-1 rounded hover:bg-emerald-100 text-emerald-700 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          disabled={isLocked || deletingId === r.id}
                          aria-label="Slet materiale"
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
                  <td colSpan={7} className="px-3 py-2 text-right text-xs text-gray-600 uppercase tracking-wide">
                    Total ({summary.count} {summary.count === 1 ? 'linje' : 'linjer'})
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(summary.total_cost, 'DKK', 2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(summary.total_sales_price, 'DKK', 2)}
                  </td>
                  <td colSpan={2} />
                </tr>
                <tr>
                  <td colSpan={7} className="px-3 py-1 text-right text-xs text-gray-600 uppercase tracking-wide">
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
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Dialog */}
      <CaseMaterialDialog
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
