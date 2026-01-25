import { notFound } from 'next/navigation'
import { getCustomer } from '@/lib/actions/customers'
import { getPortalTokens } from '@/lib/actions/portal'
import { CustomerDetailClient } from './customer-detail-client'

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params

  const [customerResult, tokensResult] = await Promise.all([
    getCustomer(id),
    getPortalTokens(id),
  ])

  if (!customerResult.success || !customerResult.data) {
    notFound()
  }

  return (
    <CustomerDetailClient
      customer={customerResult.data}
      portalTokens={tokensResult.data || []}
    />
  )
}
