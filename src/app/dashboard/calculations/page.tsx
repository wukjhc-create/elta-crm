import { Suspense } from 'react'
import { getCalculations } from '@/lib/actions/calculations'
import CalculationsClient from './calculations-client'

export const metadata = {
  title: 'Kalkulationer',
  description: 'Administrer dine kalkulationer',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    search?: string
    calculation_type?: string
    is_template?: string
    page?: string
  }>
}

export default async function CalculationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page) : 1

  const result = await getCalculations({
    search: params.search,
    calculation_type: params.calculation_type as 'solar_system' | 'electrical' | 'custom' | undefined,
    is_template: params.is_template === 'true' ? true : params.is_template === 'false' ? false : undefined,
    page,
    pageSize: 25,
  })

  return (
    <Suspense fallback={<CalculationsLoading />}>
      <CalculationsClient
        initialCalculations={result.success && result.data ? result.data : null}
        initialFilters={{
          search: params.search || '',
          calculation_type: params.calculation_type || '',
          is_template: params.is_template || '',
        }}
      />
    </Suspense>
  )
}

function CalculationsLoading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-10 bg-gray-200 rounded w-full"></div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    </div>
  )
}
