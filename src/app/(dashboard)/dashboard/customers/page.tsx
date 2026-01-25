import { getCustomers } from '@/lib/actions/customers'
import { CustomersPageClient } from '@/components/modules/customers/customers-page-client'

export default async function CustomersPage() {
  const result = await getCustomers()

  if (!result.success) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente kunder'}
        </div>
      </div>
    )
  }

  return <CustomersPageClient customers={result.data || []} />
}
