import { getGlobalFactors } from '@/lib/actions/kalkia-settings'
import GlobalFactorsClient from './global-factors-client'

export const metadata = {
  title: 'Globale Faktorer',
  description: 'Administrer globale beregningsfaktorer',
}

export const dynamic = 'force-dynamic'

export default async function GlobalFactorsPage() {
  const factorsResult = await getGlobalFactors()

  return (
    <GlobalFactorsClient
      factors={factorsResult.success && factorsResult.data ? factorsResult.data : []}
    />
  )
}
