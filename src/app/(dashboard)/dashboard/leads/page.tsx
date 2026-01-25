import { getLeads } from '@/lib/actions/leads'
import { LeadsPageClient } from '@/components/modules/leads/leads-page-client'

export default async function LeadsPage() {
  const result = await getLeads()

  if (!result.success) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente leads'}
        </div>
      </div>
    )
  }

  return <LeadsPageClient leads={result.data || []} />
}
