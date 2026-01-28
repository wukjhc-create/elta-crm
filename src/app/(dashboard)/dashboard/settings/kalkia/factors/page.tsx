import { getGlobalFactors } from '@/lib/actions/kalkia'
import GlobalFactorsClient from './global-factors-client'

export const metadata = {
  title: 'Globale Faktorer | ELTA CRM',
  description: 'Administrer globale beregningsfaktorer',
}

export default async function GlobalFactorsPage() {
  const factorsResult = await getGlobalFactors()

  return (
    <GlobalFactorsClient
      factors={factorsResult.success && factorsResult.data ? factorsResult.data : []}
    />
  )
}
