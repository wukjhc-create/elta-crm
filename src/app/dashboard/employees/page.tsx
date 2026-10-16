import type { Metadata } from 'next'
import { getEmployeeRateGapsAction, listEmployeesAction } from '@/lib/actions/employees'
import { EmployeesListClient } from './employees-list-client'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'

export const metadata: Metadata = {
  title: 'Medarbejdere',
  description: 'Oversigt over medarbejdere, satser og roller',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    q?: string
    active?: 'all' | 'active' | 'inactive'
    role?: string
  }>
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const ctx = await getPageRoleContext()
  if (!ctx.has('employees.view')) {
    return <NoAccess permission="employees.view" />
  }
  // Privacy (Henrik 2026-10-03): ingen satser på oversigten — kun i medarbejderens fane "Økonomi & løn"

  const params = await searchParams
  const activeFilter = params.active ?? 'active'
  const roleFilter = params.role ?? ''
  const search = params.q ?? ''

  // 00230: medarbejdere uden gyldig sats kan ikke registrere tid → markeres i listen (kun ja/nej)
  const rateGaps = await getEmployeeRateGapsAction()
  let all: Awaited<ReturnType<typeof listEmployeesAction>> = []
  let loadError: string | null = null
  try {
    all = await listEmployeesAction({ active: activeFilter, q: search, limit: 500 })
  } catch {
    loadError = 'Medarbejderne kunne ikke hentes lige nu — genindlæs siden.'
  }
  if (loadError) {
    return <div className="p-6"><div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900" role="alert" data-testid="employees-load-error">{loadError}</div></div>
  }

  // Role filter is client-side since the action doesn't expose it; the
  // result set is small (single tenant, max few hundred employees).
  const filtered = roleFilter
    ? all.filter((e) => e.role === roleFilter)
    : all

  return (
    <EmployeesListClient
      employees={filtered}
      rateGaps={rateGaps}
      filters={{ q: search, active: activeFilter, role: roleFilter }}
      canCreate={ctx.has('employees.edit')}
    />
  )
}
