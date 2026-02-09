import { getCalculationSettings } from '@/lib/actions/calculation-settings'
import CalculationSettingsClient from './calculation-settings-client'

export const metadata = {
  title: 'Kalkulationsindstillinger',
  description: 'Administrer timepriser, avancer og standarder for kalkulationer',
}

export const dynamic = 'force-dynamic'

export default async function CalculationSettingsPage() {
  const settingsResult = await getCalculationSettings()

  return (
    <CalculationSettingsClient
      initialSettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
