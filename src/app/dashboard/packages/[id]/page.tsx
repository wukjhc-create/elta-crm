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
    notFound()
  }

  return (
    <PackageDetailClient
      initialPackage={packageResult.data}
      categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
      components={componentsResult.success && componentsResult.data ? componentsResult.data : []}
      products={productsResult.success && productsResult.data ? productsResult.data : []}
    />
  )
}
