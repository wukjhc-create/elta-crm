import { Metadata } from 'next'
import { getOffers } from '@/lib/actions/offers'
import { getDocumentCompanySettings } from '@/lib/actions/company-public'
import { OffersPageClient } from '@/components/modules/offers/offers-page-client'
import type { OfferStatus } from '@/types/offers.types'

export const metadata: Metadata = {
  title: 'Tilbud',
  description: 'Opret og administrer tilbud til kunder',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    status?: OfferStatus
    conversion?: 'all' | 'ready' | 'converted' | 'not_converted'
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    mine?: string
    followup?: string
    awaiting?: string
    staleDays?: string
    rejectedDays?: string
  }>
}

const VALID_CONVERSION = new Set(['ready', 'converted', 'not_converted'])

export default async function OffersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1
  // W-18: pageSize fra URL'en begrænses (1–100); ugyldig → 25
  const reqSize = params.pageSize ? parseInt(params.pageSize, 10) : 25
  const pageSize = Number.isFinite(reqSize) ? Math.min(100, Math.max(1, reqSize)) : 25
  const search = params.search || undefined
  const status = params.status || undefined
  const conversion = params.conversion && VALID_CONVERSION.has(params.conversion) ? params.conversion : undefined
  const sortBy = params.sortBy || undefined
  const sortOrder = params.sortOrder || undefined
  const mine = params.mine === '1'
  const followup = params.followup === '1' // DB-3: cockpittets "Tilbud — opfølgning"
  const awaiting = params.awaiting === '1' // DB-15o: dashboardets "Afventende Tilbud" (sendt + set)
  // DB-15i/n: hele dage 1–365 (ellers ignoreret)
  const dayParam = (v?: string) => { const n = v ? parseInt(v, 10) : NaN; return Number.isFinite(n) && n >= 1 && n <= 365 ? n : undefined }
  const staleDraftDays = dayParam(params.staleDays)
  const rejectedWithinDays = dayParam(params.rejectedDays)

  const [offersResult, settingsResult] = await Promise.all([
    getOffers({
      page,
      pageSize,
      search,
      status,
      conversion,
      sortBy,
      sortOrder,
      mine,
      followup,
      awaiting,
      staleDraftDays,
      rejectedWithinDays,
    }),
    getDocumentCompanySettings(),
  ])

  if (!offersResult.success || !offersResult.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600" data-testid="offers-load-error">
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
      filters={{ search, status, conversion, mine, followup, awaiting, staleDraftDays, rejectedWithinDays }}
      sort={{ sortBy, sortOrder }}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
