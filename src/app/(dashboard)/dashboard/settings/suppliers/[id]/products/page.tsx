import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupplier } from '@/lib/actions/suppliers'
import { SupplierProductsTable } from '@/components/modules/suppliers'

interface ProductsPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProductsPageProps) {
  const { id } = await params
  const result = await getSupplier(id)

  if (!result.success || !result.data) {
    return { title: 'Leverandør ikke fundet' }
  }

  return {
    title: `Produkter - ${result.data.name} | Leverandører`,
  }
}

export default async function SupplierProductsPage({ params }: ProductsPageProps) {
  const { id } = await params
  const result = await getSupplier(id)

  if (!result.success || !result.data) {
    notFound()
  }

  const supplier = result.data

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/settings" className="hover:text-gray-700">
          Indstillinger
        </Link>
        <span>/</span>
        <Link href="/dashboard/settings/suppliers" className="hover:text-gray-700">
          Leverandører
        </Link>
        <span>/</span>
        <Link href={`/dashboard/settings/suppliers/${supplier.id}`} className="hover:text-gray-700">
          {supplier.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Produkter</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Produkter fra {supplier.name}</h1>
        <p className="text-gray-600 mt-1">
          Gennemse og administrer importerede produkter
        </p>
      </div>

      <SupplierProductsTable
        supplierId={supplier.id}
        supplierName={supplier.name}
      />
    </div>
  )
}
