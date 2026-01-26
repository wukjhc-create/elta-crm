import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCalculation } from '@/lib/actions/calculations'
import { getProductCategories, getProductsForSelect } from '@/lib/actions/products'
import { Button } from '@/components/ui/button'
import CalculationDetailClient from './calculation-detail-client'

export const metadata = {
  title: 'Kalkulation detaljer | ELTA CRM',
}

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function CalculationDetailPage({ params }: PageProps) {
  const { id } = await params
  const [calculationResult, categoriesResult, productsResult] = await Promise.all([
    getCalculation(id),
    getProductCategories(),
    getProductsForSelect(),
  ])

  if (!calculationResult.success || !calculationResult.data) {
    notFound()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/calculations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{calculationResult.data.name}</h1>
          {calculationResult.data.customer && (
            <p className="text-gray-500">
              Kunde: {calculationResult.data.customer.company_name}
            </p>
          )}
        </div>
      </div>

      <CalculationDetailClient
        calculation={calculationResult.data}
        categories={categoriesResult.success && categoriesResult.data ? categoriesResult.data : []}
        products={productsResult.success && productsResult.data ? productsResult.data : []}
      />
    </div>
  )
}
