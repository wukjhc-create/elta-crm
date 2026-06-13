import { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getInvoiceEmailConfig, getProfile } from '@/lib/actions/settings'
import { InvoiceEmailSettingsClient } from './invoice-email-settings-client'

export const metadata: Metadata = {
  title: 'Faktura- og rykkertekster',
  description: 'Redigér kundevendt faktura- og rykkerkommunikation',
}

export const dynamic = 'force-dynamic'

export default async function InvoiceEmailSettingsPage() {
  if (!(await pageHasPermission('settings.view'))) {
    return <NoAccess permission="settings.view" />
  }
  const canManage = await pageHasPermission('settings.manage')

  const res = await getInvoiceEmailConfig()
  const initial = res.success && res.data ? res.data : {}

  const profileRes = await getProfile()
  const userEmail = profileRes.success && profileRes.data ? profileRes.data.email : ''

  return (
    <InvoiceEmailSettingsClient
      initial={initial}
      canManage={canManage}
      userEmail={userEmail}
    />
  )
}
