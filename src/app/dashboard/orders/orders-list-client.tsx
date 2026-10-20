'use client'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/auth/permissions'

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
import type { CaseEconomyBatchEntry } from '@/lib/actions/service-case-economy'
import {
  caseBillingBadge,
  CASE_BILLING_BADGE_CONFIG,
  CASE_BILLING_FILTERS,
  CASE_BILLING_FILTER_LABELS,
  type CaseBillingFilter,
} from '@/lib/invoices/case-billing-status'

interface PaginationState {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

interface FiltersState {
  search?: string
  status?: ServiceCaseStatus | 'active'
  priority?: string
  type?: ServiceCaseType
  billing?: CaseBillingFilter
  /** DB-15k: kun sager med ufaktureret arbejde (cockpittets "Klar til fakturering") */
  unbilled?: boolean
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
  billingCapHit = null,
  cases,
  employees,
  pagination,
  filters,
  economy = {},
  canSeeBilling = false,
  statusCounts = null,
}: {
  billingCapHit?: number | null
  cases: ServiceCaseWithRelations[]
  employees: EmployeeOption[]
  pagination: PaginationState
  filters: FiltersState
  economy?: Record<string, CaseEconomyBatchEntry>
  canSeeBilling?: boolean
  /** N9c: antal sager pr. status (kun roller med cases.view.all) */
  statusCounts?: Record<string, number> | null
}) {
  const { role } = useUserRole()
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
    <div className="p-0 md:p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sager / Ordrer</h1>
          <p className="text-xs text-gray-500">
            {pagination.totalItems} sager · viser side {pagination.currentPage} af {pagination.totalPages || 1}
          </p>
        </div>
        {/* M-16: kun med cases.create (bogholderi landede på "ingen adgang") */}
        {!!role && hasPermission(role, 'cases.create') && (
        <Link
          href="/dashboard/orders/new"
          className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + Ny sag
        </Link>
        )}
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
              className="border rounded px-2 py-1.5 text-sm w-full sm:w-56"
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
            <option value="">Alle{statusCounts?.total != null ? ` (${statusCounts.total})` : ''}</option>
            {/* DB-15l: samme definition som dashboardets "aktive sager" (ikke lukket/konverteret) */}
            <option value="active">Aktive (ikke lukket)</option>
            {SERVICE_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SERVICE_CASE_STATUS_LABELS[s]}{statusCounts?.[s] != null ? ` (${statusCounts[s]})` : ''}
              </option>
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

        {canSeeBilling && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fakturering</label>
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={filters.billing ?? ''}
              onChange={(e) => updateParam('billing', e.target.value || null)}
            >
              <option value="">Alle</option>
              {CASE_BILLING_FILTERS.map((b) => (
                <option key={b} value={b}>{CASE_BILLING_FILTER_LABELS[b]}</option>
              ))}
            </select>
          </div>
        )}

        {filters.unbilled && (
          <span className="inline-flex items-center gap-1 px-2 py-1 mb-1 bg-amber-100 rounded-full text-sm" data-testid="orders-unbilled-chip">
            Med ufaktureret arbejde
          </span>
        )}
        {(filters.search || filters.status || filters.type || filters.billing || filters.unbilled) && (
          <button
            className="text-xs text-emerald-700 hover:underline pb-2"
            onClick={() => startTransition(() => router.push('/dashboard/orders'))}
          >
            Nulstil filtre
          </button>
        )}
      </div>

      {billingCapHit != null && (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900" data-testid="orders-billing-cap">
          Faktureringsfilteret gennemgår de {billingCapHit} nyeste sager — ældre sager er ikke med. Søg eller filtrér på status for at finde dem.
        </div>
      )}

      {/* Table */}
      <div className="hidden md:block bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
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
                {canSeeBilling && <th className="px-3 py-2 text-right">Faktureret / Udestående</th>}
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={canSeeBilling ? 13 : 12} className="px-3 py-12 text-center text-gray-400 text-sm">
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
                        <Link href={`/dashboard/orders/${c.id}`} className="text-emerald-700 hover:underline"
                          title={c.created_at ? `Oprettet ${new Date(c.created_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Copenhagen' })}` : undefined}>
                          {c.case_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[c.status]}`}>
                          {SERVICE_CASE_STATUS_LABELS[c.status]}
                        </span>
                        {/* N9c: kun prioriteter der kræver opmærksomhed (som i Service-listen) */}
                        {(c.priority === 'urgent' || c.priority === 'high') && (
                          <span className={`ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.priority === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`} data-testid="order-priority">
                            {c.priority === 'urgent' ? 'Haster' : 'Høj'}
                          </span>
                        )}
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
                      {canSeeBilling && (
                        <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                          {(() => {
                            const e = economy[c.id]
                            const badge = caseBillingBadge(e, c.status)
                            const cfg = badge !== 'none' ? CASE_BILLING_BADGE_CONFIG[badge] : null
                            const hasNumbers = e && e.invoice_count > 0
                            return (
                              <div className="flex flex-col items-end gap-1">
                                {hasNumbers ? (
                                  <span>
                                    <span className="text-gray-700">{fmtAmount(e!.net_invoiced)}</span>
                                    {e!.outstanding_total > 0 && (
                                      <span className="text-amber-700 font-medium"> · {fmtAmount(e!.outstanding_total)}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                                {cfg && (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${cfg.cls}`}>
                                    {cfg.label}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                      )}
                      {/* Privacy (Henrik 2026-10-03): lav-DB vises ikke på sagslisten — se sagens Økonomi-fane */}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* W-4 (pilot-review 2026-10-15): på mobil kort i stedet for 13-kolonne-tabel (montørens bundnav går hertil) */}
      <div className="md:hidden space-y-2" data-testid="orders-mobile-list">
        {cases.length === 0 ? (
          <p className="bg-white rounded-lg ring-1 ring-gray-200 p-4 text-sm text-gray-500">Ingen sager.</p>
        ) : cases.map((c) => {
          const customerName = c.customer?.company_name || c.customer?.contact_person || '—'
          const place = [c.address, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
          return (
            <Link key={c.id} href={`/dashboard/orders/${c.id}`} className="block bg-white rounded-lg ring-1 ring-gray-200 p-3 active:bg-gray-50" data-testid="orders-mobile-card">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-emerald-700">{c.case_number}</span>
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${SERVICE_CASE_STATUS_COLORS[c.status]}`}>{SERVICE_CASE_STATUS_LABELS[c.status]}</span>
                {(c.priority === 'urgent' || c.priority === 'high') && (
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.priority === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>{c.priority === 'urgent' ? 'Haster' : 'Høj'}</span>
                )}
              </div>
              <div className="mt-1 font-medium text-gray-900 truncate">{c.project_name || c.title}</div>
              <div className="text-xs text-gray-600 truncate">{customerName}</div>
              {place && <div className="text-xs text-gray-500 truncate">{place}</div>}
              {(c.start_date || c.end_date) && <div className="text-xs text-gray-500">{fmtDateRange(c.start_date, c.end_date)}</div>}
            </Link>
          )
        })}
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
