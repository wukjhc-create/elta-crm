import type { Metadata } from 'next'
import { getServiceCases } from '@/lib/actions/service-cases'
import { getServiceCaseEconomyBatch, type CaseEconomyBatchEntry } from '@/lib/actions/service-case-economy'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
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
  // Sprint 7E — accept enten cases.view.all eller cases.view.assigned.
  // Salg/montor faar kun egne sager via scope-filter i getServiceCases.
  const canViewAll = await pageHasPermission('cases.view.all')
  const canViewAssigned = await pageHasPermission('cases.view.assigned')
  if (!canViewAll && !canViewAssigned) {
    return <NoAccess permission="cases.view.all" />
  }

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

  // Sprint Ø8.1 — cost-free projektøkonomi for de viste sager (batch, ingen
  // N+1). Kun hvis brugeren har faktura-/billing-adgang; ellers ingen tal i
  // payload eller UI.
  const canSeeBilling = await pageHasPermission('invoices.view.own_cases')
  let economy: Record<string, CaseEconomyBatchEntry> = {}
  if (canSeeBilling) {
    const caseIds = casesResult.data.data.map((c) => c.id)
    const ecoRes = await getServiceCaseEconomyBatch(caseIds)
    if (ecoRes.success && ecoRes.data) economy = ecoRes.data
  }

  return (
    <OrdersListClient
      cases={casesResult.data.data}
      employees={Array.from(employeeMap.values())}
      economy={economy}
      canSeeBilling={canSeeBilling}
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
