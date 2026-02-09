import { notFound } from 'next/navigation'
import { getOffer } from '@/lib/actions/offers'
import { getCompanySettings } from '@/lib/actions/settings'
import { OfferDetailClient } from './offer-detail-client'

export const dynamic = 'force-dynamic'

interface OfferDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function OfferDetailPage({ params }: OfferDetailPageProps) {
  const { id } = await params

  const [offerResult, settingsResult] = await Promise.all([
    getOffer(id),
    getCompanySettings(),
  ])

  if (!offerResult.success || !offerResult.data) {
    notFound()
  }

  return (
    <OfferDetailClient
      offer={offerResult.data}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
