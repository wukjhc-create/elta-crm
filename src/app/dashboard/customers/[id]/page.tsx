import { notFound } from 'next/navigation'
import { getCustomer } from '@/lib/actions/customers'
import { getPortalTokens } from '@/lib/actions/portal'
import { getPartnerTokens } from '@/lib/actions/partner-portal'
import { getDocumentCompanySettings } from '@/lib/actions/company-public'
import { CustomerDetailClient } from './customer-detail-client'
import { pageHasPermission } from '@/lib/auth/page-guard'

export const dynamic = 'force-dynamic'

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params

  const [customerResult, tokensResult, partnerTokensResult, settingsResult] = await Promise.all([
    getCustomer(id),
    getPortalTokens(id),
    getPartnerTokens(id),
    getDocumentCompanySettings(),
  ])

  if (!customerResult.success || !customerResult.data) {
    if (!customerResult.success && customerResult.error && customerResult.error !== 'Kunden blev ikke fundet') {
      return (
        <div className="p-6">
          <p className="text-sm text-red-700" data-testid="customer-detail-load-error">
            {customerResult.error}. Det tælles ikke som at kunden mangler.
          </p>
        </div>
      )
    }
    notFound()
  }
  // D48: kundeaftaler (leverandørrabat, avance, kostpris) kun for prisværktøjet (admin, serviceleder)
  const canManagePricing = await pageHasPermission('tools.pricing')

  return (
    <CustomerDetailClient
      customer={customerResult.data}
      portalTokens={tokensResult.success ? tokensResult.data || [] : []}
      portalTokensError={tokensResult.success ? null : tokensResult.error || 'Kunne ikke hente portal-adgange'}
      partnerTokens={partnerTokensResult.success ? partnerTokensResult.data || [] : []}
      partnerTokensError={partnerTokensResult.success ? null : partnerTokensResult.error || 'Kunne ikke hente partner-adgange'}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
      canManagePricing={canManagePricing}
    />
  )
}
