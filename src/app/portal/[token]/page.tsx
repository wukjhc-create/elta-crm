import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffers, getPortalMessages, getPortalDocuments } from '@/lib/actions/portal'
import { getPortalFuldmagter } from '@/lib/actions/fuldmagt'
import { getPortalServiceCases } from '@/lib/actions/service-cases'
import { createAnonClient } from '@/lib/supabase/server'
import { PortalDashboard } from '@/components/modules/portal/portal-dashboard'
import type { CompanySettings } from '@/types/company-settings.types'

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

  // Fetch data (all anon-safe)
  const [offersResult, messagesResult, documentsResult, serviceCasesResult, fuldmagterResult] = await Promise.all([
    getPortalOffers(token),
    getPortalMessages(token),
    getPortalDocuments(token),
    getPortalServiceCases(session.customer_id),
    getPortalFuldmagter(token),
  ])

  // Fetch company settings with anon client (no auth required)
  let companySettings: CompanySettings | null = null
  try {
    const supabase = createAnonClient()
    const { data } = await supabase.from('company_settings').select('*').maybeSingle()
    companySettings = data as CompanySettings | null
  } catch {
    // Non-critical
  }

  return (
    <PortalDashboard
      token={token}
      session={session}
      offers={offersResult.data || []}
      messages={messagesResult.data || []}
      documents={documentsResult.data || []}
      serviceCases={serviceCasesResult.data || []}
      fuldmagter={fuldmagterResult.data || []}
      companySettings={companySettings}
    />
  )
}
