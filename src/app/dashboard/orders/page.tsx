import type { Metadata } from 'next'
import { getServiceCases } from '@/lib/actions/service-cases'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { OrdersListClient } from './orders-list-client'
import type {
  ServiceCaseStatus,
  ServiceCasePriority,
  ServiceCaseType,
} from '@/types/service-cases.types'

export const metadata: Metadata = {
  title: 'Sager / Ordrer',
  description: 'Oversigt over sager og ordrer',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    status?: ServiceCaseStatus
    priority?: ServiceCasePriority
    type?: ServiceCaseType
  }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1

  // Pull cases (reuses Phase 6.1 server action — already joins customer + assignee).
  const casesResult = await getServiceCases({
    page,
    pageSize: 50,
    search: params.search,
    status: params.status,
    priority: params.priority,
  })

  // Pull employees for formand name lookup (small set, cached per request).
  let employeeMap = new Map<string, { id: string; name: string }>()
  try {
    const { supabase } = await getAuthenticatedClient()
    const { data } = await supabase
      .from('employees')
      .select('id, name, first_name, last_name')
    employeeMap = new Map(
      (data ?? []).map((e) => [
        e.id as string,
        {
          id: e.id as string,
          name:
            (e.name as string | null) ||
            [e.first_name, e.last_name].filter(Boolean).join(' ') ||
            '—',
        },
      ])
    )
  } catch {
    /* employees table optional in this view */
  }

  if (!casesResult.success || !casesResult.data) {
    return (
      <div className="p-6">
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          Kunne ikke hente sager: {casesResult.error || 'ukendt fejl'}
        </div>
      </div>
    )
  }

  return (
    <OrdersListClient
      cases={casesResult.data.data}
      employees={Array.from(employeeMap.values())}
      pagination={{
        currentPage: casesResult.data.page,
        totalPages: casesResult.data.totalPages,
        totalItems: casesResult.data.total,
        pageSize: casesResult.data.pageSize,
      }}
      filters={{
        search: params.search,
        status: params.status,
        priority: params.priority,
        type: params.type,
      }}
    />
  )
}
