import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffers, getPortalMessages } from '@/lib/actions/portal'
import { PortalDashboard } from '@/components/modules/portal/portal-dashboard'

interface PortalPageProps {
  params: Promise<{ token: string }>
}

export default async function PortalTokenPage({ params }: PortalPageProps) {
  const { token } = await params

  // Validate token
  const sessionResult = await validatePortalToken(token)

  if (!sessionResult.success || !sessionResult.data) {
    redirect('/portal/invalid')
  }

  const session = sessionResult.data

  // Fetch data
  const [offersResult, messagesResult] = await Promise.all([
    getPortalOffers(token),
    getPortalMessages(token),
  ])

  return (
    <PortalDashboard
      token={token}
      session={session}
      offers={offersResult.data || []}
      messages={messagesResult.data || []}
    />
  )
}
