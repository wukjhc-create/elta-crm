import { Metadata } from 'next'
import { getSolarProductsByType, getSolarAssumptions } from '@/lib/actions/solar-products'
import { SolarSettingsClient } from './solar-settings-client'

export const metadata: Metadata = {
  title: 'Solcelle produkter',
  description: 'Administrer solcellepaneler, invertere og batterier',
}

export const dynamic = 'force-dynamic'

export default async function SolarSettingsPage() {
  const [productsResult, assumptionsResult] = await Promise.all([
    getSolarProductsByType(),
    getSolarAssumptions(),
  ])

  if (!productsResult.success || !assumptionsResult.success) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-medium">Kunne ikke hente data</h2>
          <p className="text-red-600 text-sm mt-1">
            {productsResult.error || assumptionsResult.error}
          </p>
        </div>
      </div>
    )
  }

  return (
    <SolarSettingsClient
      initialProducts={productsResult.data!}
      initialAssumptions={assumptionsResult.data!}
    />
  )
}
