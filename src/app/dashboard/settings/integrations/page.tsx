import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { IntegrationsSettingsClient } from './integrations-settings-client'

export const metadata: Metadata = {
  title: 'Integrationer',
  description: 'Konfigurer webhooks og eksterne integrationer',
}

export const dynamic = 'force-dynamic'

export default async function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Integrationer</h1>
          <p className="text-gray-600 mt-1">Tredjepartsapps og forbindelser</p>
        </div>
      </div>

      <IntegrationsSettingsClient />
    </div>
  )
}
