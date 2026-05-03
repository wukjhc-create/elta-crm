import type { Metadata } from 'next'
import { listEmployeesAction } from '@/lib/actions/employees'
import { EmployeesListClient } from './employees-list-client'

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
  const params = await searchParams
  const activeFilter = params.active ?? 'active'
  const roleFilter = params.role ?? ''
  const search = params.q ?? ''

  const all = await listEmployeesAction({
    active: activeFilter,
    q: search,
    limit: 500,
  })

  // Role filter is client-side since the action doesn't expose it; the
  // result set is small (single tenant, max few hundred employees).
  const filtered = roleFilter
    ? all.filter((e) => e.role === roleFilter)
    : all

  return (
    <EmployeesListClient
      employees={filtered}
      filters={{ q: search, active: activeFilter, role: roleFilter }}
    />
  )
}
