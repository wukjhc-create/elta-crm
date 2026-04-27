import type { Metadata } from 'next'
import { getServiceCases, getServiceCaseStats } from '@/lib/actions/service-cases'
import { ServiceCasesClient } from './service-cases-client'
import type { ServiceCaseStatus, ServiceCasePriority } from '@/types/service-cases.types'

export const metadata: Metadata = {
  title: 'Serviceopgaver',
  description: 'Oversigt over serviceopgaver',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    status?: ServiceCaseStatus
    priority?: ServiceCasePriority
  }>
}

export default async function ServiceCasesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1

  const [casesResult, statsResult] = await Promise.all([
    getServiceCases({
      page,
      pageSize: 25,
      search: params.search,
      status: params.status,
      priority: params.priority,
    }),
    getServiceCaseStats(),
  ])

  if (!casesResult.success || !casesResult.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {casesResult.error || 'Kunne ikke hente serviceopgaver'}
        </div>
      </div>
    )
  }

  return (
    <ServiceCasesClient
      cases={casesResult.data.data}
      pagination={{
        currentPage: casesResult.data.page,
        totalPages: casesResult.data.totalPages,
        totalItems: casesResult.data.total,
        pageSize: casesResult.data.pageSize,
      }}
      filters={{ search: params.search, status: params.status, priority: params.priority }}
      stats={statsResult.success ? statsResult.data! : { total: 0, new: 0, in_progress: 0, pending: 0, closed: 0, converted: 0 }}
    />
  )
}
