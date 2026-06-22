import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NotificationsSettingsPage() {
  // Notifikations-præferencer er midlertidigt skjult: der findes endnu ingen afsendelses-sti
  // for nogen af de events, så toggles ville være uærlige. Komponenten
  // (notifications-settings-client.tsx) og DB-kolonnen profiles.notification_preferences
  // bevares til fremtidig brug, men ruten redirecter til settings indtil systemet bygges.
  redirect('/dashboard/settings')
}
