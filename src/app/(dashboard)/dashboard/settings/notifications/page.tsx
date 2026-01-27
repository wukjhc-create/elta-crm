import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NotificationsSettingsClient } from './notifications-settings-client'

export default function NotificationsSettingsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Notifikationer</h1>
          <p className="text-gray-600 mt-1">E-mail og push</p>
        </div>
      </div>

      <NotificationsSettingsClient />
    </div>
  )
}
