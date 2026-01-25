import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffer, getPortalMessages } from '@/lib/actions/portal'
import { OfferDetail } from '@/components/modules/portal/offer-detail'

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

  // Fetch offer and messages
  const [offerResult, messagesResult] = await Promise.all([
    getPortalOffer(token, id),
    getPortalMessages(token, id),
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
    />
  )
}
