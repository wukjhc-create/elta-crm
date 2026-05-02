'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  listIncomingInvoicesAction,
  type IncomingInvoiceListItem,
} from '@/lib/actions/incoming-invoices'
import { Button } from '@/components/ui/button'

type FilterKey = 'needs_review' | 'awaiting_approval' | 'approved' | 'rejected' | 'posted' | 'all'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'needs_review',      label: 'Kræver gennemgang' },
  { key: 'awaiting_approval', label: 'Afventer godkendelse' },
  { key: 'approved',          label: 'Godkendt' },
  { key: 'rejected',          label: 'Afvist' },
  { key: 'posted',            label: 'Bogført' },
  { key: 'all',               label: 'Alle' },
]

interface CountMap {
  awaiting_approval: number
  needs_review: number
  approved: number
  rejected: number
  posted: number
}

const fmtAmount = (n: number | null, ccy = 'DKK') =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(n)

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

const fmtPct = (n: number | null) =>
  n == null ? '—' : `${Math.round(n * 100)} %`

export function IncomingInvoicesListClient({
  initialRows,
  initialCounts,
}: {
  initialRows: IncomingInvoiceListItem[]
  initialCounts: CountMap
}) {
  const [rows, setRows] = useState<IncomingInvoiceListItem[]>(initialRows)
  const [filter, setFilter] = useState<FilterKey>('needs_review')
  const [busy, startTransition] = useTransition()
  const [counts] = useState<CountMap>(initialCounts)

  useEffect(() => {
    startTransition(async () => {
      const next = await listIncomingInvoicesAction({ status: filter })
      setRows(next)
    })
  }, [filter])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Indgående fakturaer</h1>
        <p className="text-xs text-gray-500">
          Godkend leverandørfakturaer · auto-pushed til e-conomic ved godkendelse.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = countFor(counts, f.key)
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                active
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
              }`}
            >
              {f.label}
              {count != null && (
                <span className={`ml-2 inline-block min-w-[22px] text-center text-xs px-1.5 rounded ${
                  active ? 'bg-white/20' : 'bg-gray-100'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2">Leverandør</th>
              <th className="px-3 py-2">Faktura nr</th>
              <th className="px-3 py-2 text-right">Beløb</th>
              <th className="px-3 py-2">Faktura dato</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Konfidens</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {busy && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-xs">Henter…</td></tr>
            )}
            {!busy && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-xs">Ingen fakturaer i denne kategori.</td></tr>
            )}
            {!busy && rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/dashboard/incoming-invoices/${r.id}`} className="font-medium text-emerald-700 hover:underline">
                    {r.supplier_name || '—'}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.invoice_number ?? '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtAmount(r.amount_incl_vat, r.currency)}</td>
                <td className="px-3 py-2 text-xs">{fmtDate(r.invoice_date)}</td>
                <td className="px-3 py-2"><StatusBadge row={r} /></td>
                <td className="px-3 py-2 text-right text-xs">
                  <span className="text-gray-500">parse</span> {fmtPct(r.parse_confidence)}
                  <span className="text-gray-400 mx-1">·</span>
                  <span className="text-gray-500">match</span> {fmtPct(r.match_confidence)}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/dashboard/incoming-invoices/${r.id}`}>
                    <Button size="sm" variant="outline">Åbn</Button>
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

function countFor(c: CountMap, k: FilterKey): number | null {
  if (k === 'all') return null
  return c[k] ?? 0
}

function StatusBadge({ row }: { row: IncomingInvoiceListItem }) {
  if (row.requires_manual_review && row.status !== 'rejected' && row.status !== 'approved' && row.status !== 'posted') {
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Kræver gennemgang</span>
  }
  const colour =
    row.status === 'approved'           ? 'bg-emerald-100 text-emerald-800'
    : row.status === 'posted'           ? 'bg-emerald-100 text-emerald-900'
    : row.status === 'rejected'         ? 'bg-red-100 text-red-800'
    : row.status === 'cancelled'        ? 'bg-gray-100 text-gray-700'
    : row.status === 'awaiting_approval' ? 'bg-blue-100 text-blue-800'
    : 'bg-gray-100 text-gray-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colour}`}>{row.status}</span>
}
