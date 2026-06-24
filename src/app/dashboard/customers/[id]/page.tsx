import { notFound } from 'next/navigation'
import { getCustomer } from '@/lib/actions/customers'
import { getPortalTokens } from '@/lib/actions/portal'
import { getPartnerTokens } from '@/lib/actions/partner-portal'
import { getCompanySettings } from '@/lib/actions/settings'
import { CustomerDetailClient } from './customer-detail-client'

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
    getCompanySettings(),
  ])

  if (!customerResult.success || !customerResult.data) {
    notFound()
  }

  return (
    <CustomerDetailClient
      customer={customerResult.data}
      portalTokens={tokensResult.data || []}
      partnerTokens={partnerTokensResult.data || []}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
