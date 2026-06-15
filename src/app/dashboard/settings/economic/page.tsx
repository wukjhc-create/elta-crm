import { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getEconomicIntegrationStatusAction } from '@/lib/actions/accounting'
import { EconomicSettingsClient } from './economic-settings-client'

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

  return <EconomicSettingsClient initial={status} canEdit={true} />
}
