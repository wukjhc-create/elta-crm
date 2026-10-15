import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffers, getPortalMessages, getPortalDocuments, getPortalInvoices } from '@/lib/actions/portal'
import { getPortalFuldmagter } from '@/lib/actions/fuldmagt'
import { getPortalServiceCases } from '@/lib/actions/service-cases'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY_SETTINGS_PORTAL_COLUMNS } from '@/lib/settings/company-columns'
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
  const [offersResult, messagesResult, documentsResult, serviceCasesResult, invoicesResult, fuldmagterResult] = await Promise.all([
    getPortalOffers(token),
    getPortalMessages(token),
    getPortalDocuments(token),
    getPortalServiceCases(token),
    getPortalInvoices(token),
    getPortalFuldmagter(token),
  ])

  // Phase α.3 trin 1: company_settings hentes nu via admin-client efter
  // valideret token. Singleton-row uden kundespecifik PII; intet scope-
  // tjek nødvendigt. Anon-policy droppet i migration 00128.
  let companySettings: CompanySettings | null = null
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('company_settings').select(COMPANY_SETTINGS_PORTAL_COLUMNS).maybeSingle()
    companySettings = data as unknown as CompanySettings | null
  } catch {
    // Non-critical
  }

  return (
    <PortalDashboard
      token={token}
      session={session}
      offers={offersResult.success ? offersResult.data || [] : []}
      offersError={offersResult.success ? null : offersResult.error || 'Kunne ikke hente tilbud'}
      messages={messagesResult.success ? messagesResult.data || [] : []}
      messagesError={messagesResult.success ? null : messagesResult.error || 'Kunne ikke hente beskeder'}
      documents={documentsResult.success ? documentsResult.data || [] : []}
      documentsError={documentsResult.success ? null : documentsResult.error || 'Kunne ikke hente dokumenter'}
      serviceCases={serviceCasesResult.success ? serviceCasesResult.data || [] : []}
      serviceCasesError={serviceCasesResult.success ? null : serviceCasesResult.error || 'Kunne ikke hente serviceopgaver'}
      invoices={invoicesResult.success ? invoicesResult.data || [] : []}
      invoicesError={invoicesResult.success ? null : invoicesResult.error || 'Kunne ikke hente fakturaer'}
      fuldmagter={fuldmagterResult.data || []}
      fuldmagterError={fuldmagterResult.success ? null : fuldmagterResult.error || 'Kunne ikke hente dokumenter'}
      companySettings={companySettings}
    />
  )
}
