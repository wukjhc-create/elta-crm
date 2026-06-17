import type { Metadata } from 'next'
import { getServiceCases } from '@/lib/actions/service-cases'
import { getServiceCaseEconomyBatch, type CaseEconomyBatchEntry } from '@/lib/actions/service-case-economy'
import { caseMatchesBillingFilter, type CaseBillingFilter } from '@/lib/invoices/case-billing-status'
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
    billing?: string
  }>
}

const VALID_BILLING = new Set<CaseBillingFilter>(['outstanding', 'ready_final', 'over_invoiced', 'no_contract'])
// Cap for global faktureringsfilter: filtrér på tværs af op til N sager i
// scope (filter-derefter-paginér). Bounded queries (cases + invoices) — ingen
// N+1. Over capen falder vi tilbage til upagineret filtrering af de første N.
const BILLING_FILTER_CAP = 500
const LIST_PAGE_SIZE = 50

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

  // Sprint Ø8.1/Ø8.2 — billing-gate. Faktureringsstatus/-tal + -filter kræver
  // invoices.view.own_cases; uden adgang ignoreres billing helt (ingen payload).
  const canSeeBilling = await pageHasPermission('invoices.view.own_cases')
  const billingFilter: CaseBillingFilter | undefined =
    canSeeBilling && params.billing && VALID_BILLING.has(params.billing as CaseBillingFilter)
      ? (params.billing as CaseBillingFilter)
      : undefined

  // Pull cases (reuses Phase 6.1 server action — already joins customer + assignee).
  // Ved aktivt billing-filter hentes et større, scope-respekterende sæt (cap),
  // beregnes økonomi i batch, filtreres korrekt og pagineres derefter i memory
  // (filter-derefter-paginér) — så filteret er korrekt på tværs af sager, ikke
  // kun den viste side. Ingen N+1.
  const casesResult = await getServiceCases({
    page: billingFilter ? 1 : page,
    pageSize: billingFilter ? BILLING_FILTER_CAP : LIST_PAGE_SIZE,
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

  // Sprint Ø8.1 — cost-free projektøkonomi (batch, ingen N+1). Kun ved
  // billing-adgang; ellers ingen tal i payload eller UI.
  let economy: Record<string, CaseEconomyBatchEntry> = {}
  let displayCases = casesResult.data.data
  let pag = {
    currentPage: casesResult.data.page,
    totalPages: casesResult.data.totalPages,
    totalItems: casesResult.data.total,
    pageSize: casesResult.data.pageSize,
  }

  if (canSeeBilling) {
    const ecoRes = await getServiceCaseEconomyBatch(casesResult.data.data.map((c) => c.id))
    if (ecoRes.success && ecoRes.data) economy = ecoRes.data

    if (billingFilter) {
      // Filtrér det hentede sæt korrekt, derefter paginér i memory.
      const matched = casesResult.data.data.filter((c) =>
        caseMatchesBillingFilter(economy[c.id], c.status, billingFilter)
      )
      const totalMatched = matched.length
      const start = (page - 1) * LIST_PAGE_SIZE
      displayCases = matched.slice(start, start + LIST_PAGE_SIZE)
      pag = {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalMatched / LIST_PAGE_SIZE)),
        totalItems: totalMatched,
        pageSize: LIST_PAGE_SIZE,
      }
    } else {
      // Upagineret-batch er kun aktuelt ved filter; her er sættet allerede 1 side.
      displayCases = casesResult.data.data
    }
  }

  return (
    <OrdersListClient
      cases={displayCases}
      employees={Array.from(employeeMap.values())}
      economy={economy}
      canSeeBilling={canSeeBilling}
      pagination={pag}
      filters={{
        search: params.search,
        status: params.status,
        priority: params.priority,
        type: params.type,
        billing: billingFilter,
      }}
    />
  )
}
