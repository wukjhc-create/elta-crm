import { Metadata } from 'next'
import { SmsSettingsClient } from './sms-settings-client'
import { getSmsSettings, getSmsTemplates } from '@/lib/actions/sms'

export const metadata: Metadata = {
  title: 'SMS indstillinger | Elta CRM',
  description: 'Konfigurer GatewayAPI og SMS skabeloner',
}

export default async function SmsSettingsPage() {
  const [settingsResult, templates] = await Promise.all([
    getSmsSettings(),
    getSmsTemplates({ active_only: false }),
  ])

  const smsSettings = settingsResult.success ? (settingsResult.data ?? null) : null

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">SMS indstillinger</h1>
        <p className="text-muted-foreground">
          Konfigurer GatewayAPI og administrer SMS skabeloner
        </p>
      </div>

      <SmsSettingsClient
        initialSettings={smsSettings}
        initialTemplates={templates}
      />
    </div>
  )
}
