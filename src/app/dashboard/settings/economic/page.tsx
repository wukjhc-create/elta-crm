import { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getEconomicIntegrationStatusAction } from '@/lib/actions/accounting'
import { EconomicSettingsClient } from './economic-settings-client'
import { ExportErrorNotificationSettings } from './export-error-notification-settings'

export const metadata: Metadata = {
  title: 'Regnskab (e-conomic)',
  description: 'Sikker opsætning af regnskabsintegration',
}

export const dynamic = 'force-dynamic'

export default async function EconomicSettingsPage() {
  // settings.economic gater både visning og redigering — samme model som
  // Ø6.0/Ø6.1 (rolle admin/bogholderi). Ingen separat settings.manage-krav.
  if (!(await pageHasPermission('settings.economic'))) {
    return <NoAccess permission="settings.economic" />
  }
  const status = await getEconomicIntegrationStatusAction()

  return (
    <div className="space-y-4">
      <EconomicSettingsClient initial={status} canEdit={true} />
      <div className="p-6 pt-0 max-w-2xl">
        <ExportErrorNotificationSettings />
      </div>
    </div>
  )
}
