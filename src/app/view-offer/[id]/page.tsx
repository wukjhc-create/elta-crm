import { notFound } from 'next/navigation'
import { getPublicOffer } from '@/lib/actions/public-offer'
import { OfferViewClient } from './offer-view-client'

export const dynamic = 'force-dynamic'

interface ViewOfferPageProps {
  params: Promise<{ id: string }>
}

export default async function ViewOfferPage({ params }: ViewOfferPageProps) {
  const { id } = await params
  const offer = await getPublicOffer(id)

  if (!offer) {
    notFound()
  }

  return <OfferViewClient offer={offer} />
}
