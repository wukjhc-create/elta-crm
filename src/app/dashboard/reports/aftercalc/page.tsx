import type { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { AftercalcOverviewClient } from './aftercalc-overview-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Efterkalkulation | ELTA Drift',
  description: 'Tilbudt mod faktisk dækningsbidrag pr. sag',
}

export default async function AftercalcReportPage() {
  if (!(await pageHasPermission('economy.cost_prices'))) {
    return <NoAccess permission="economy.cost_prices" />
  }
  return <AftercalcOverviewClient />
}
