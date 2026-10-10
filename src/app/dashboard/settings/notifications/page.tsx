import { getNotificationPreferences } from '@/lib/actions/settings'
import { NotificationsSettingsClient } from './notifications-settings-client'

export const dynamic = 'force-dynamic'

/**
 * Henrik 2026-10-10: personlige notifikationsindstillinger (00220 opretter profiles.notification_preferences +
 * kolonne-grant). Afsenderne respekterer valget (lib/notifications/user-notify.ts); kanaler/hændelser uden afsender vises
 * som "ikke tilgængelig".
 */
export default async function NotificationsSettingsPage() {
  const result = await getNotificationPreferences()
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifikationer</h1>
        <p className="text-sm text-gray-500">Vælg hvilke hændelser du vil have besked om</p>
      </div>
      <NotificationsSettingsClient savedPreferences={result.success && result.data ? result.data : {}} />
    </div>
  )
}
