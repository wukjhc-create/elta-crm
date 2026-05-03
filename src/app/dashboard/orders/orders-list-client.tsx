'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  SERVICE_CASE_TYPES,
  SERVICE_CASE_TYPE_LABELS,
  type ServiceCaseStatus,
  type ServiceCaseType,
  type ServiceCaseWithRelations,
} from '@/types/service-cases.types'

interface PaginationState {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

interface FiltersState {
  search?: string
  status?: ServiceCaseStatus
  priority?: string
  type?: ServiceCaseType
}

interface EmployeeOption {
  id: string
  name: string
}

const fmtAmount = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(Number(n))

const fmtDateRange = (start: string | null, end: string | null) => {
  if (!start && !end) return '—'
  if (start && end) return `${start.slice(0, 10)} → ${end.slice(0, 10)}`
  return (start || end || '').slice(0, 10)
}

export function OrdersListClient({
  cases,
  employees,
  pagination,
  filters,
}: {
  cases: ServiceCaseWithRelations[]
  employees: EmployeeOption[]
  pagination: PaginationState
  filters: FiltersState
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.search ?? '')

  const empById = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  )

  const updateParam = (key: string, value: string | null | undefined) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (value && value.length > 0) params.set(key, value)
    else params.delete(key)
    params.delete('page') // reset to page 1 on filter change
    startTransition(() => router.push(`/dashboard/orders?${params.toString()}`))
  }

  const goToPage = (n: number) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (n <= 1) params.delete('page')
    else params.set('page', String(n))
    startTransition(() => router.push(`/dashboard/orders?${params.toString()}`))
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sager / Ordrer</h1>
          <p className="text-xs text-gray-500">
            {pagination.totalItems} sager · viser side {pagination.currentPage} af {pagination.totalPages || 1}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Søg (titel · kunde · case nr)</label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateParam('search', searchInput.trim() || null)
            }}
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="fx Møllevej, SVC-01000…"
              className="border rounded px-2 py-1.5 text-sm w-56"
            />
          </form>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={filters.status ?? ''}
            onChange={(e) => updateParam('status', e.target.value || null)}
          >
            <option value="">Alle</option>
            {SERVICE_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={filters.type ?? ''}
            onChange={(e) => updateParam('type', e.target.value || null)}
          >
            <option value="">Alle</option>
            {SERVICE_CASE_TYPES.map((t) => (
              <option key={t} value={t}>{SERVICE_CASE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {(filters.search || filters.status || filters.type) && (
          <button
            className="text-xs text-emerald-700 hover:underline pb-2"
            onClick={() => startTransition(() => router.push('/dashboard/orders'))}
          >
            Nulstil filtre
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2">Sag/ordrenr</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Projektnavn / Titel</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Rekvirent</th>
                <th className="px-3 py-2">Ansvarlig</th>
                <th className="px-3 py-2">Formand</th>
                <th className="px-3 py-2">Planlagt</th>
                <th className="px-3 py-2 text-right">Tilbudt</th>
                <th className="px-3 py-2 text-right">Revideret</th>
                <th className="px-3 py-2 text-center">Lav DB</th>
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-12 text-center text-gray-400 text-sm">
                    {filters.search || filters.status || filters.type
                      ? 'Ingen sager matcher filtrene.'
                      : 'Ingen sager endnu — opret din første sag fra et tilbud, en email eller manuelt.'}
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
                  const customerName =
                    c.customer?.company_name ||
                    c.customer?.contact_person ||
                    '—'
                  const assigneeName = c.assignee?.full_name || '—'
                  const formandName =
                    c.formand_id ? (empById.get(c.formand_id) || '—') : '—'
                  return (
                    <tr key={c.id} className="border-t hover:bg-gray-50 transition">
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`/dashboard/orders/${c.id}`} className="text-emerald-700 hover:underline">
                          {c.case_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[c.status]}`}>
                          {SERVICE_CASE_STATUS_LABELS[c.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate" title={c.project_name || c.title}>
                        <Link href={`/dashboard/orders/${c.id}`} className="font-medium hover:underline">
                          {c.project_name || c.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">{customerName}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.type ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                            {SERVICE_CASE_TYPE_LABELS[c.type]}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{c.reference || <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-xs">{c.requisition || <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-xs">{assigneeName}</td>
                      <td className="px-3 py-2 text-xs">{formandName}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDateRange(c.start_date, c.end_date)}</td>
                      <td className="px-3 py-2 text-right text-xs">{fmtAmount(c.contract_sum)}</td>
                      <td className="px-3 py-2 text-right text-xs">{fmtAmount(c.revised_sum)}</td>
                      <td className="px-3 py-2 text-center">
                        {c.low_profit ? (
                          <span title="Margin under 15 %" className="inline-block w-2 h-2 rounded-full bg-red-500" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-gray-200" />
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            onClick={() => goToPage(pagination.currentPage - 1)}
            disabled={pagination.currentPage <= 1}
          >
            ← Forrige
          </button>
          <span className="text-xs text-gray-500">
            Side {pagination.currentPage} af {pagination.totalPages}
          </span>
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            onClick={() => goToPage(pagination.currentPage + 1)}
            disabled={pagination.currentPage >= pagination.totalPages}
          >
            Næste →
          </button>
        </div>
      )}
    </div>
  )
}
