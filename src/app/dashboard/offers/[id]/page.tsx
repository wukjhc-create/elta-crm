import { notFound } from 'next/navigation'
import { getOffer } from '@/lib/actions/offers'
import { getCompanySettings } from '@/lib/actions/settings'
import { getCalculationSettings } from '@/lib/actions/calculation-settings'
import { getServiceCaseFromOffer } from '@/lib/actions/offer-to-case'
import { OfferDetailClient } from './offer-detail-client'

export const dynamic = 'force-dynamic'

interface OfferDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function OfferDetailPage({ params }: OfferDetailPageProps) {
  const { id } = await params

  const [offerResult, settingsResult, calcSettingsResult, linkedCaseResult] = await Promise.all([
    getOffer(id),
    getCompanySettings(),
    getCalculationSettings(),
    getServiceCaseFromOffer(id),
  ])

  if (!offerResult.success || !offerResult.data) {
    notFound()
  }

  const dbThresholds = calcSettingsResult.success && calcSettingsResult.data
    ? {
        green: calcSettingsResult.data.margins.db_green_threshold,
        yellow: calcSettingsResult.data.margins.db_yellow_threshold,
        red: calcSettingsResult.data.margins.db_red_threshold,
      }
    : undefined

  const linkedCase =
    linkedCaseResult.success && linkedCaseResult.data ? linkedCaseResult.data : null

  return (
    <OfferDetailClient
      offer={offerResult.data}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
      dbThresholds={dbThresholds}
      linkedCase={linkedCase}
    />
  )
}
