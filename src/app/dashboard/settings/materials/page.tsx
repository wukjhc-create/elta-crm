import { MaterialsAdmin } from '@/components/modules/materials/materials-admin'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Materialer | Indstillinger',
}

export default function MaterialsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Materialer</h1>
        <p className="text-gray-600 mt-1">
          Administrer interne materialer og bind dem til leverandørprodukter.
          Bundne materialer bruger kun den valgte leverandør i auto-tilbud — uden fallback-søgning.
        </p>
      </div>

      <MaterialsAdmin />
    </div>
  )
}
