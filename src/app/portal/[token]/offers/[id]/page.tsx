import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffer, getPortalMessages } from '@/lib/actions/portal'
import { getCompanySettings } from '@/lib/actions/settings'
import { OfferDetail } from '@/components/modules/portal/offer-detail'

export const dynamic = 'force-dynamic'

interface OfferPageProps {
  params: Promise<{ token: string; id: string }>
}

export default async function PortalOfferPage({ params }: OfferPageProps) {
  const { token, id } = await params

  // Validate token
  const sessionResult = await validatePortalToken(token)

  if (!sessionResult.success || !sessionResult.data) {
    redirect('/portal/invalid')
  }

  const session = sessionResult.data

  // Fetch offer, messages, and company settings
  const [offerResult, messagesResult, settingsResult] = await Promise.all([
    getPortalOffer(token, id),
    getPortalMessages(token, id),
    getCompanySettings(),
  ])

  if (!offerResult.success || !offerResult.data) {
    redirect(`/portal/${token}`)
  }

  return (
    <OfferDetail
      token={token}
      session={session}
      offer={offerResult.data}
      messages={messagesResult.data || []}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
