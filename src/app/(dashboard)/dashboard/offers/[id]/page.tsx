import { notFound } from 'next/navigation'
import { getOffer } from '@/lib/actions/offers'
import { OfferDetailClient } from './offer-detail-client'

interface OfferDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function OfferDetailPage({ params }: OfferDetailPageProps) {
  const { id } = await params

  const result = await getOffer(id)

  if (!result.success || !result.data) {
    notFound()
  }

  return <OfferDetailClient offer={result.data} />
}
