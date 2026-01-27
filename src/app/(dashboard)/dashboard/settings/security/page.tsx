import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SecuritySettingsClient } from './security-settings-client'

export default function SecuritySettingsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Sikkerhed</h1>
          <p className="text-gray-600 mt-1">Adgangskode og 2FA</p>
        </div>
      </div>

      <SecuritySettingsClient />
    </div>
  )
}
