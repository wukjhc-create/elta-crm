import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupplier } from '@/lib/actions/suppliers'
import { SupplierDetailClient } from './supplier-detail-client'

interface SupplierPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: SupplierPageProps) {
  const { id } = await params
  const result = await getSupplier(id)

  if (!result.success || !result.data) {
    return { title: 'Leverandør ikke fundet' }
  }

  return {
    title: `${result.data.name} | Leverandører`,
  }
}

export default async function SupplierPage({ params }: SupplierPageProps) {
  const { id } = await params
  const result = await getSupplier(id)

  if (!result.success || !result.data) {
    notFound()
  }

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
        <span className="text-gray-900">{result.data.name}</span>
      </div>

      <SupplierDetailClient supplier={result.data} />
    </div>
  )
}
