import { getOffers } from '@/lib/actions/offers'
import { OffersPageClient } from '@/components/modules/offers/offers-page-client'

export default async function OffersPage() {
  const result = await getOffers()

  if (!result.success) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente tilbud'}
        </div>
      </div>
    )
  }

  return <OffersPageClient offers={result.data || []} />
}
