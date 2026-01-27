import { Suspense } from 'react'
import { getPackages, getPackageCategories } from '@/lib/actions/packages'
import PackagesClient from './packages-client'

export const metadata = {
  title: 'Pakker | ELTA CRM',
  description: 'Administrer dine pakker og bundter',
}

interface PageProps {
  searchParams: Promise<{
    search?: string
    category_id?: string
  }>
}

export default async function PackagesPage({ searchParams }: PageProps) {
  const params = await searchParams

  const [packagesResult, categoriesResult] = await Promise.all([
    getPackages({
      search: params.search,
      category_id: params.category_id,
      is_active: true,
    }),
    getPackageCategories(),
  ])

  return (
    <Suspense fallback={<PackagesLoading />}>
      <PackagesClient
        initialPackages={packagesResult.success && packagesResult.data ? packagesResult.data : []}
        categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
        initialFilters={{
          search: params.search || '',
          category_id: params.category_id || '',
        }}
      />
    </Suspense>
  )
}

function PackagesLoading() {
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
