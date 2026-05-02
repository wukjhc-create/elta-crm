import { Suspense } from 'react'
import { getProducts, getProductCategories } from '@/lib/actions/products'
import ProductsClient from './products-client'

export const metadata = {
  title: 'Produktkatalog',
  description: 'Administrer dit produktkatalog',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    search?: string
    category_id?: string
    page?: string
  }>
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page) : 1

  const [productsResult, categoriesResult] = await Promise.all([
    getProducts({
      search: params.search,
      category_id: params.category_id,
      page,
      pageSize: 25,
    }),
    getProductCategories(),
  ])

  return (
    <Suspense fallback={<ProductsLoading />}>
      <ProductsClient
        initialProducts={productsResult.success && productsResult.data ? productsResult.data : null}
        categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
        initialFilters={{
          search: params.search || '',
          category_id: params.category_id || '',
        }}
      />
    </Suspense>
  )
}

function ProductsLoading() {
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
