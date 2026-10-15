import { notFound } from 'next/navigation'
import {
  getPackageWithItems,
  getPackageCategories,
  getComponentsForPicker,
  getProductsForPicker,
} from '@/lib/actions/packages'
import PackageDetailClient from './package-detail-client'

export const metadata = {
  title: 'Rediger pakke',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PackageDetailPage({ params }: PageProps) {
  const { id } = await params

  const [packageResult, categoriesResult, componentsResult, productsResult] = await Promise.all([
    getPackageWithItems(id),
    getPackageCategories(),
    getComponentsForPicker(),
    getProductsForPicker(),
  ])

  if (!packageResult.success || !packageResult.data) {
    if (!packageResult.success && packageResult.error && packageResult.error !== 'Pakken blev ikke fundet') {
      return (
        <div className="p-6">
          <p className="text-sm text-red-700" data-testid="package-detail-load-error">
            {packageResult.error}. Det tælles ikke som at pakken mangler.
          </p>
        </div>
      )
    }
    notFound()
  }

  return (
    <PackageDetailClient
      initialPackage={packageResult.data}
      categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
      categoriesError={categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'}
      components={componentsResult.success && componentsResult.data ? componentsResult.data : []}
      componentsError={componentsResult.success ? null : componentsResult.error || 'Kunne ikke hente komponenter'}
      products={productsResult.success && productsResult.data ? productsResult.data : []}
      productsError={productsResult.success ? null : productsResult.error || 'Kunne ikke hente produkter'}
    />
  )
}
