import { SuppliersList } from '@/components/modules/suppliers'
import { SupplierHealthOverview } from '@/components/modules/suppliers/supplier-health-overview'
import { SupplierSyncOverviewPanel } from '@/components/modules/suppliers/supplier-sync-overview'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Leverandører | Indstillinger',
}

export default function SuppliersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Leverandører</h1>
        <p className="text-gray-600 mt-1">
          Administrer grossister og leverandører til produktimport
        </p>
      </div>

      <SupplierSyncOverviewPanel />

      <SupplierHealthOverview />

      <SuppliersList />
    </div>
  )
}
