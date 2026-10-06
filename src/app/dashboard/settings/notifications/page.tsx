import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NotificationsSettingsPage() {
  // Notifikations-præferencer er midlertidigt skjult: der findes endnu ingen afsendelses-sti
  // for nogen af de events, så toggles ville være uærlige. Komponenten
  // (notifications-settings-client.tsx) bevares; NB: kolonnen profiles.notification_preferences findes IKKE i prod
  // (statisk skematjek 2026-10-06, trods migration 00048) og skal oprettes med godkendelse, før siden
  // genåbnes. Ruten redirecter til settings indtil systemet bygges.
  redirect('/dashboard/settings')
}
