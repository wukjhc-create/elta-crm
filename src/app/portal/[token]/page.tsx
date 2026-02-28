import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffers, getPortalMessages, getPortalDocuments } from '@/lib/actions/portal'
import { getCompanySettings } from '@/lib/actions/settings'
import { PortalDashboard } from '@/components/modules/portal/portal-dashboard'

export const dynamic = 'force-dynamic'

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
  const [offersResult, messagesResult, settingsResult, documentsResult] = await Promise.all([
    getPortalOffers(token),
    getPortalMessages(token),
    getCompanySettings(),
    getPortalDocuments(token),
  ])

  return (
    <PortalDashboard
      token={token}
      session={session}
      offers={offersResult.data || []}
      messages={messagesResult.data || []}
      documents={documentsResult.data || []}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
