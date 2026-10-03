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
    notFound()
  }
  // D48: kundeaftaler (leverandørrabat, avance, kostpris) kun for prisværktøjet (admin, serviceleder)
  const canManagePricing = await pageHasPermission('tools.pricing')

  return (
    <CustomerDetailClient
      customer={customerResult.data}
      portalTokens={tokensResult.data || []}
      partnerTokens={partnerTokensResult.data || []}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
      canManagePricing={canManagePricing}
    />
  )
}
