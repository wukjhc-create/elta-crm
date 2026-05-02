'use client'

import { useRouter } from 'next/navigation'
import { ImportWizard } from '@/components/modules/suppliers/import-wizard'

interface ImportPageClientProps {
  supplierId: string
  supplierName: string
  supplierCode: string | null
}

export function ImportPageClient({
  supplierId,
  supplierName,
  supplierCode,
}: ImportPageClientProps) {
  const router = useRouter()

  const handleComplete = () => {
    router.push(`/dashboard/settings/suppliers/${supplierId}/products`)
  }

  return (
    <ImportWizard
      supplierId={supplierId}
      supplierName={supplierName}
      supplierCode={supplierCode}
      onComplete={handleComplete}
    />
  )
}
