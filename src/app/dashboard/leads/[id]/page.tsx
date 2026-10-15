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
    if (!leadResult.success && leadResult.error && leadResult.error !== 'Lead blev ikke fundet') {
      return (
        <div className="p-6">
          <p className="text-sm text-red-700" data-testid="lead-detail-load-error">
            {leadResult.error}. Det tælles ikke som at leadet mangler.
          </p>
        </div>
      )
    }
    notFound()
  }

  return (
    <LeadDetailClient
      lead={leadResult.data}
      activities={activitiesResult.success ? activitiesResult.data || [] : []}
      activitiesError={activitiesResult.success ? null : activitiesResult.error || 'Kunne ikke hente aktiviteter'}
    />
  )
}
