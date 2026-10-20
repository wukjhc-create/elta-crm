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
      templatesError={templatesResult.success ? null : templatesResult.error || 'Kunne ikke hente projektskabeloner'}
      roomTypes={roomTypesResult.success && roomTypesResult.data ? roomTypesResult.data : []}
      roomTypesError={roomTypesResult.success ? null : roomTypesResult.error || 'Kunne ikke hente rumtyper'}
      components={componentsResult.success && componentsResult.data ? componentsResult.data : []}
      componentsError={componentsResult.success ? null : componentsResult.error || 'Kunne ikke hente komponenter'}
      settings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
    />
  )
}
