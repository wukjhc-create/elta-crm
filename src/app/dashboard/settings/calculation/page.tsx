import { getCalculationSettings } from '@/lib/actions/calculation-settings'
import CalculationSettingsClient from './calculation-settings-client'

import { ManageOnly } from '@/components/auth/manage-only'
import { pageHasPermission } from '@/lib/auth/page-guard'
export const metadata = {
  title: 'Kalkulationsindstillinger',
  description: 'Administrer timepriser, avancer og standarder for kalkulationer',
}

export const dynamic = 'force-dynamic'

export default async function CalculationSettingsPage() {
  const settingsResult = await getCalculationSettings()
  const canManage = await pageHasPermission('settings.manage') // PM2-9: gem kræver settings.manage

  return (
    <ManageOnly canManage={canManage} what="kalkulationsindstillingerne">
      <CalculationSettingsClient
        initialSettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
      />
    </ManageOnly>
  )
}
