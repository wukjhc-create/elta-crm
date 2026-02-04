import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupplier } from '@/lib/actions/suppliers'
import { ImportPageClient } from './import-page-client'

interface ImportPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ImportPageProps) {
  const { id } = await params
  const result = await getSupplier(id)

  if (!result.success || !result.data) {
    return { title: 'Leverandør ikke fundet' }
  }

  return {
    title: `Import - ${result.data.name} | Leverandører`,
  }
}

export default async function SupplierImportPage({ params }: ImportPageProps) {
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
        <span className="text-gray-900">Import</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Importer produkter</h1>
        <p className="text-gray-600 mt-1">
          Upload en produktfil fra {supplier.name}
        </p>
      </div>

      <ImportPageClient
        supplierId={supplier.id}
        supplierName={supplier.name}
        supplierCode={supplier.code}
      />
    </div>
  )
}
