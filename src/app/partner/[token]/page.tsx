import { redirect } from 'next/navigation'
import {
  validatePartnerToken,
  getPartnerServiceCases,
  getPartnerDocuments,
} from '@/lib/actions/partner-portal'
import { PartnerDashboard } from '@/components/modules/partner/partner-dashboard'

export const dynamic = 'force-dynamic'

interface PartnerPageProps {
  params: Promise<{ token: string }>
}

export default async function PartnerTokenPage({ params }: PartnerPageProps) {
  const { token } = await params

  // Validate token
  const sessionResult = await validatePartnerToken(token)

  if (!sessionResult.success || !sessionResult.data) {
    redirect('/partner/invalid')
  }

  const session = sessionResult.data

  // Fetch data (cost-free, scoped på payer_customer_id)
  const [serviceCasesResult, documentsResult] = await Promise.all([
    getPartnerServiceCases(token),
    getPartnerDocuments(token),
  ])

  return (
    <PartnerDashboard
      token={token}
      session={session}
      serviceCases={serviceCasesResult.data || []}
      documents={documentsResult.data || []}
    />
  )
}
