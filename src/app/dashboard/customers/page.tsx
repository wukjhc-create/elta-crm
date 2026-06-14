import { Metadata } from 'next'
import { getCustomers, getCustomersWithPaymentState } from '@/lib/actions/customers'
import type { CustomerPaymentBadge } from '@/lib/actions/invoices'
import type { CustomerWithRelations } from '@/types/customers.types'
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

  // Sprint Ø4.9 — betalingsfilter + GLOBAL sortering + tællere via SQL-view.
  const paymentFilter = parsePaymentFilter(params.payment)
  const paymentSort = parsePaymentSort(params.paysort)
  const canViewPayments = await pageHasPermission('invoices.view.own_cases')

  let customers: CustomerWithRelations[] = []
  let total = 0
  let resPage = page
  let resPageSize = pageSize
  let totalPages = 0
  let paymentBadges: Record<string, CustomerPaymentBadge> = {}
  let paymentCounts: PaymentCounts | undefined
  let error: string | null = null

  if (canViewPayments) {
    // Søgning + betalingsfilter + global betalingssortering + paginering — alt
    // i SQL via v_customers_with_payment_summary. Ingen limit 20000, ingen N+1.
    const res = await getCustomersWithPaymentState({
      page, pageSize, search, is_active, sortBy, sortOrder, payment: paymentFilter, paysort: paymentSort,
    })
    if (res.success && res.data) {
      customers = res.data.data
      total = res.data.total
      resPage = res.data.page
      resPageSize = res.data.pageSize
      totalPages = res.data.totalPages
      paymentBadges = res.data.badges
      paymentCounts = res.data.counts
    } else {
      error = res.error ?? 'Kunne ikke hente kunder'
    }
  } else {
    // Uden fakturaadgang: kundelisten fungerer som før (ingen betalingsdata).
    const res = await getCustomers({ page, pageSize, search, is_active, sortBy, sortOrder })
    if (res.success && res.data) {
      customers = res.data.data
      total = res.data.total
      resPage = res.data.page
      resPageSize = res.data.pageSize
      totalPages = res.data.totalPages
    } else {
      error = res.error ?? 'Kunne ikke hente kunder'
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <CustomersPageClient
      customers={customers}
      pagination={{ currentPage: resPage, totalPages, totalItems: total, pageSize: resPageSize }}
      filters={{ search, is_active }}
      sort={{ sortBy, sortOrder }}
      paymentBadges={paymentBadges}
      canViewPayments={canViewPayments}
      paymentFilter={paymentFilter}
      paymentSort={paymentSort}
      paymentCounts={paymentCounts}
    />
  )
}
