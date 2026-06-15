import { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getInvoiceEmailConfig, getProfile } from '@/lib/actions/settings'
import { InvoiceEmailSettingsClient } from './invoice-email-settings-client'
import { PaymentReportSettings } from './payment-report-settings'

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
    <div className="space-y-5">
      <InvoiceEmailSettingsClient
        initial={initial}
        canManage={canManage}
        userEmail={userEmail}
      />
      <div className="p-6 pt-0 max-w-5xl">
        <PaymentReportSettings canManage={canManage} />
      </div>
    </div>
  )
}
