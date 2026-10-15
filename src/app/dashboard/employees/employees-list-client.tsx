'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { EMPLOYEE_ROLE_OPTIONS, type EmployeeRow } from '@/types/employees.types'

const fmtAmount = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK',
        maximumFractionDigits: 0,
      }).format(Number(n))

const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')

const ROLE_LABEL = new Map(EMPLOYEE_ROLE_OPTIONS.map((r) => [r.value, r.label]))

function roleLabel(role: string): string {
  return ROLE_LABEL.get(role as any) ?? role
}

interface FiltersState {
  q?: string
  active?: 'all' | 'active' | 'inactive'
  role?: string
}

export function EmployeesListClient({
  employees,
  filters,
  loadError = null,
  canSeePayroll = false,
}: {
  employees: EmployeeRow[]
  loadError?: string | null
  filters: FiltersState
  /** Sprint 7D — gate til hourly_rate / cost_rate kolonner i listen.
   *  Server-action stripper allerede felterne hvis ingen payroll.view,
   *  saa hvis canSeePayroll=false er rates altid null. Vi skjuler
   *  kolonnerne for at undgaa "—" stoej. */
  canSeePayroll?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.q ?? '')

  const updateParam = (key: string, value: string | null | undefined) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (value && value.length > 0) params.set(key, value)
    else params.delete(key)
    startTransition(() =>
      router.push(`/dashboard/employees?${params.toString()}`)
    )
  }

  const totalActive = employees.filter((e) => e.active).length
  const totalInactive = employees.length - totalActive

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/dashboard" className="hover:text-gray-700">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-gray-900">Medarbejdere</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Medarbejdere</h1>
          <p className="text-xs text-gray-500">
            {employees.length} medarbejder{employees.length === 1 ? '' : 'e'} ·{' '}
            {totalActive} aktiv{totalActive === 1 ? '' : 'e'}
            {totalInactive > 0 && ` · ${totalInactive} inaktiv${totalInactive === 1 ? '' : 'e'}`}
          </p>
        </div>
        <Link
          href="/dashboard/employees/new"
          className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + Opret medarbejder
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Søg (navn · email · medarbejdernr · telefon)
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateParam('q', searchInput.trim() || null)
            }}
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="fx Lars, lars@..."
              aria-label="Søg medarbejdere"
              className="border rounded px-2 py-1.5 text-sm w-full sm:w-64"
            />
          </form>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            className="border rounded px-2 py-1.5 text-sm bg-white"
            value={filters.active ?? 'active'}
            onChange={(e) => updateParam('active', e.target.value)}
            aria-label="Status"
          >
            <option value="active">Kun aktive</option>
            <option value="inactive">Kun inaktive</option>
            <option value="all">Alle</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Rolle</label>
          <select
            className="border rounded px-2 py-1.5 text-sm bg-white"
            value={filters.role ?? ''}
            onChange={(e) => updateParam('role', e.target.value || null)}
            aria-label="Rolle"
          >
            <option value="">Alle</option>
            {EMPLOYEE_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {(filters.q || (filters.active && filters.active !== 'active') || filters.role) && (
          <button
            type="button"
            className="text-xs text-emerald-700 hover:underline pb-2"
            onClick={() => startTransition(() => router.push('/dashboard/employees'))}
          >
            Nulstil filtre
          </button>
        )}
      </div>

      {/* List or empty state */}
      {loadError ? (
        <p className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900" data-testid="employees-list-load-error">{loadError}</p>
      ) : employees.length === 0 ? (
        <EmptyState hasFilters={!!(filters.q || filters.role || (filters.active && filters.active !== 'active'))} />
      ) : (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
          <div className="md:hidden divide-y" data-testid="employees-mobile-list">
            {employees.map((e) => (
              <div key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/employees/${e.id}`} className="font-medium text-gray-900 hover:text-emerald-700 hover:underline break-words">
                      {e.name || '—'}
                    </Link>
                    {e.employee_number && (
                      <span className="ml-2 text-xs text-gray-400 font-mono break-all">{e.employee_number}</span>
                    )}
                    <p className="text-sm text-gray-700">{roleLabel(e.role)}</p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${e.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                    {e.active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </div>
                <div className="mt-2 text-sm">
                  {e.email ? <a href={`mailto:${e.email}`} className="text-emerald-700 hover:underline break-all">{e.email}</a> : <span className="text-gray-400">—</span>}
                </div>
                <div className="text-sm">
                  {e.phone ? <a href={`tel:${e.phone}`} className="text-emerald-700 hover:underline break-all">{e.phone}</a> : <span className="text-gray-400">—</span>}
                </div>
                <p className="mt-2 text-xs text-gray-600">Ansat {fmtDate(e.hire_date)}</p>
                {canSeePayroll && (
                  <p className="text-xs text-gray-700">Intern kost {fmtAmount(e.cost_rate)} · salgspris {fmtAmount(e.hourly_rate)}</p>
                )}
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2">Navn</th>
                  <th className="px-3 py-2">Rolle</th>
                  <th className="px-3 py-2">E-mail</th>
                  <th className="px-3 py-2">Telefon</th>
                  <th className="px-3 py-2">Status</th>
                  {canSeePayroll && (
                    <>
                      <th className="px-3 py-2 text-right">Intern kost</th>
                      <th className="px-3 py-2 text-right">Salgspris</th>
                    </>
                  )}
                  <th className="px-3 py-2">Ansat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/employees/${e.id}`}
                        className="font-medium text-gray-900 hover:text-emerald-700 hover:underline break-words"
                      >
                        {e.name || '—'}
                      </Link>
                      {e.employee_number && (
                        <span className="ml-2 text-xs text-gray-400 font-mono break-all">
                          {e.employee_number}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{roleLabel(e.role)}</td>
                    <td className="px-3 py-2">
                      {e.email ? (
                        <a
                          href={`mailto:${e.email}`}
                          className="text-emerald-700 hover:underline break-all"
                        >
                          {e.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.phone ? (
                        <a href={`tel:${e.phone}`} className="text-emerald-700 hover:underline break-all">
                          {e.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.active ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Aktiv
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                          Inaktiv
                        </span>
                      )}
                    </td>
                    {canSeePayroll && (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtAmount(e.cost_rate)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtAmount(e.hourly_rate)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-gray-600">{fmtDate(e.hire_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-16 bg-white rounded-lg ring-1 ring-gray-200">
      <h3 className="text-base font-medium text-gray-700">
        {hasFilters ? 'Ingen medarbejdere matcher filtrene' : 'Ingen medarbejdere endnu'}
      </h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        {hasFilters
          ? 'Prøv at nulstille filtrene eller udvid søgningen.'
          : 'Opret den første medarbejder for at kunne planlægge dem på sager og registrere timer.'}
      </p>
      {!hasFilters && (
        <Link
          href="/dashboard/employees/new"
          className="mt-4 inline-flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + Opret medarbejder
        </Link>
      )}
    </div>
  )
}
