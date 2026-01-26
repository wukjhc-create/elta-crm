import { getLeads } from '@/lib/actions/leads'
import { LeadsPageClient } from '@/components/modules/leads/leads-page-client'
import type { LeadStatus, LeadSource } from '@/types/leads.types'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    status?: LeadStatus
    source?: LeadSource
  }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : 25
  const search = params.search || undefined
  const status = params.status || undefined
  const source = params.source || undefined

  const result = await getLeads({
    page,
    pageSize,
    search,
    status,
    source,
  })

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente leads'}
        </div>
      </div>
    )
  }

  return (
    <LeadsPageClient
      leads={result.data.data}
      pagination={{
        currentPage: result.data.page,
        totalPages: result.data.totalPages,
        totalItems: result.data.total,
        pageSize: result.data.pageSize,
      }}
      filters={{ search, status, source }}
    />
  )
}
