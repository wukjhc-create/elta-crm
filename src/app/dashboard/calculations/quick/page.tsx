import { getProjectTemplates, getRoomTypes, getComponentsWithPricing, getCalculationSettings } from '@/lib/actions/calculation-settings'
import QuickCalculationClient from './quick-calculation-client'

export const metadata = {
  title: 'Hurtig Kalkulation',
  description: 'Opret hurtigt en kalkulation baseret på projekttype og rum',
}

export const dynamic = 'force-dynamic'

export default async function QuickCalculationPage() {
  const [templatesResult, roomTypesResult, componentsResult, settingsResult] = await Promise.all([
    getProjectTemplates(),
    getRoomTypes(),
    getComponentsWithPricing(),
    getCalculationSettings(),
  ])

  return (
    <QuickCalculationClient
      templates={templatesResult.success && templatesResult.data ? templatesResult.data : []}
      roomTypes={roomTypesResult.success && roomTypesResult.data ? roomTypesResult.data : []}
      components={componentsResult.success && componentsResult.data ? componentsResult.data : []}
      settings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
