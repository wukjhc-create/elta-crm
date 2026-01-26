import { getCustomers } from '@/lib/actions/customers'
import { CustomersPageClient } from '@/components/modules/customers/customers-page-client'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    is_active?: string
  }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page, 10) : 1
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : 25
  const search = params.search || undefined
  const is_active = params.is_active === 'true' ? true : params.is_active === 'false' ? false : undefined

  const result = await getCustomers({
    page,
    pageSize,
    search,
    is_active,
  })

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente kunder'}
        </div>
      </div>
    )
  }

  return (
    <CustomersPageClient
      customers={result.data.data}
      pagination={{
        currentPage: result.data.page,
        totalPages: result.data.totalPages,
        totalItems: result.data.total,
        pageSize: result.data.pageSize,
      }}
      filters={{ search, is_active }}
    />
  )
}
