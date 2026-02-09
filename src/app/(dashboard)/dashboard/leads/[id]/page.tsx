import { notFound } from 'next/navigation'
import { getLead, getLeadActivities } from '@/lib/actions/leads'
import { LeadDetailClient } from './lead-detail-client'

export const dynamic = 'force-dynamic'

interface LeadDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params

  const [leadResult, activitiesResult] = await Promise.all([
    getLead(id),
    getLeadActivities(id),
  ])

  if (!leadResult.success || !leadResult.data) {
    notFound()
  }

  return (
    <LeadDetailClient
      lead={leadResult.data}
      activities={activitiesResult.data || []}
    />
  )
}
