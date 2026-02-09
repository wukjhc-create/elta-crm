import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getProduct, getProductCategories } from '@/lib/actions/products'
import { Button } from '@/components/ui/button'
import ProductDetailClient from './product-detail-client'

export const metadata = {
  title: 'Produkt detaljer',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const [productResult, categoriesResult] = await Promise.all([
    getProduct(id),
    getProductCategories(),
  ])

  if (!productResult.success || !productResult.data) {
    notFound()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{productResult.data.name}</h1>
          {productResult.data.sku && (
            <p className="text-gray-500">SKU: {productResult.data.sku}</p>
          )}
        </div>
      </div>

      <ProductDetailClient
        product={productResult.data}
        categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
      />
    </div>
  )
}
