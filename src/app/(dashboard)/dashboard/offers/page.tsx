import { getOffers } from '@/lib/actions/offers'
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

  const result = await getOffers({
    page,
    pageSize,
    search,
    status,
  })

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente tilbud'}
        </div>
      </div>
    )
  }

  return (
    <OffersPageClient
      offers={result.data.data}
      pagination={{
        currentPage: result.data.page,
        totalPages: result.data.totalPages,
        totalItems: result.data.total,
        pageSize: result.data.pageSize,
      }}
      filters={{ search, status }}
    />
  )
}
