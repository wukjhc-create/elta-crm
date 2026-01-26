import { getOffers } from '@/lib/actions/offers'
import { getCompanySettings } from '@/lib/actions/settings'
import { OffersPageClient } from '@/components/modules/offers/offers-page-client'
import type { OfferStatus } from '@/types/offers.types'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    status?: OfferStatus
  }>
}

export default async function OffersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : 25
  const search = params.search || undefined
  const status = params.status || undefined

  const [offersResult, settingsResult] = await Promise.all([
    getOffers({
      page,
      pageSize,
      search,
      status,
    }),
    getCompanySettings(),
  ])

  if (!offersResult.success || !offersResult.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {offersResult.error || 'Kunne ikke hente tilbud'}
        </div>
      </div>
    )
  }

  return (
    <OffersPageClient
      offers={offersResult.data.data}
      pagination={{
        currentPage: offersResult.data.page,
        totalPages: offersResult.data.totalPages,
        totalItems: offersResult.data.total,
        pageSize: offersResult.data.pageSize,
      }}
      filters={{ search, status }}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
