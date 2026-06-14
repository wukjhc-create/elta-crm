import { Metadata } from 'next'
import { getCustomers } from '@/lib/actions/customers'
import {
  getCustomersPaymentBadgesAction,
  getCustomerPaymentListStateAction,
  type CustomerPaymentBadge,
} from '@/lib/actions/invoices'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { parsePaymentFilter, parsePaymentSort, type PaymentCounts } from './customer-payment-filter'
import { CustomersPageClient } from '@/components/modules/customers/customers-page-client'

export const metadata: Metadata = {
  title: 'Kunder',
  description: 'Administrer kunder og kontaktpersoner',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    is_active?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    payment?: string
    paysort?: string
  }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : 25
  const search = params.search || undefined
  const is_active = params.is_active === 'true' ? true : params.is_active === 'false' ? false : undefined
  const sortBy = params.sortBy || undefined
  const sortOrder = params.sortOrder || undefined

  // Sprint Ø4.5/Ø4.6 — betalingsfilter + GLOBAL betalingssortering + tællere.
  const paymentFilter = parsePaymentFilter(params.payment)
  const paymentSort = parsePaymentSort(params.paysort)
  const canViewPayments = await pageHasPermission('invoices.view.own_cases')

  // Ét aggregat (ÉN invoices-query) → counts + globalt filtreret/sorteret ids.
  // Køres KUN for brugere med fakturaadgang.
  let paymentCounts: PaymentCounts | undefined
  let aggregateIds: string[] | undefined
  let aggregateSorted = false
  if (canViewPayments && (paymentFilter !== 'all' || paymentSort !== 'default')) {
    const state = await getCustomerPaymentListStateAction(paymentFilter, paymentSort)
    if (state.ok) {
      paymentCounts = state.counts
      aggregateIds = state.ids
      aggregateSorted = state.sorted
    } else {
      aggregateIds = []
    }
  } else if (canViewPayments) {
    // Kun tællere (filter=all, sort=default).
    const state = await getCustomerPaymentListStateAction('all', 'default')
    if (state.ok) paymentCounts = state.counts
  }

  // GLOBAL sortering vinder over fritekst-søgning (kan ikke kombineres her).
  const useGlobalSort = aggregateSorted && !search

  let result
  if (useGlobalSort && aggregateIds) {
    // Paginér den globalt sorterede id-liste selv; bevar rækkefølge.
    const offset = (page - 1) * pageSize
    const pageIds = aggregateIds.slice(offset, offset + pageSize)
    result = await getCustomers({
      page,
      pageSize,
      is_active,
      preserveOrderIds: pageIds,
      totalOverride: aggregateIds.length,
    })
  } else {
    // Filter-whitelist-sti (global filtrering, getCustomers paginerer/sorterer).
    const customerIds = paymentFilter !== 'all' && canViewPayments ? aggregateIds ?? [] : undefined
    result = await getCustomers({
      page,
      pageSize,
      search,
      is_active,
      sortBy,
      sortOrder,
      customerIds,
    })
  }

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente kunder'}
        </div>
      </div>
    )
  }

  // Sprint Ø4.4 — cost-free betalings-badges i ÉN batch-query for de
  // synlige kunder (max 25/side → ingen N+1). Kun for fakturaadgang.
  let paymentBadges: Record<string, CustomerPaymentBadge> = {}
  if (canViewPayments) {
    const ids = result.data.data.map((c) => c.id)
    const res = await getCustomersPaymentBadgesAction(ids)
    if (res.ok) paymentBadges = res.badges
  }

  return (
    <CustomersPageClient
      customers={result.data.data}
      pagination={{
        currentPage: result.data.page,
        totalPages: result.data.totalPages,
        totalItems: result.data.total,
        pageSize: result.data.pageSize,
      }}
      filters={{ search, is_active }}
      sort={{ sortBy, sortOrder }}
      paymentBadges={paymentBadges}
      canViewPayments={canViewPayments}
      paymentFilter={paymentFilter}
      paymentSort={paymentSort}
      paymentCounts={paymentCounts}
      globalSortActive={useGlobalSort}
    />
  )
}
