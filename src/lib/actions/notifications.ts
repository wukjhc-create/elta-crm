'use server'

/**
 * Server Action — consolidated notification feed.
 *
 * Sprint Performance 1: the dashboard previously fired THREE separate
 * polling requests every 60 s from always-mounted components:
 *   - getMyPendingReminders()  (task-reminder-overlay)
 *   - getUnreadPriceAlerts()   (task-reminder-overlay)
 *   - getSystemAlerts()        (notification-dropdown)
 *
 * Each call is its own Vercel function invocation. This action collapses all
 * three into ONE invocation: the queries still run independently (in
 * parallel, server-side) but the client makes a single round-trip. The
 * NotificationsProvider polls this once and fans the result out to both
 * components via context.
 */

import {
  getMyPendingReminders,
  getUnreadPriceAlerts,
  type PriceAlert,
} from '@/lib/actions/customer-tasks'
import { getSystemAlerts } from '@/lib/actions/calculation-intelligence'
import type { CustomerTaskWithRelations } from '@/types/customer-tasks.types'
import type { SystemAlert } from '@/types/calculation-intelligence.types'

/**
 * For each slice:
 *   T[]   = fetched successfully (may be an empty list)
 *   null  = fetch failed → the caller MUST keep its existing state and NOT
 *           overwrite it (prevents a transient backend error from blanking
 *           the notification UI).
 */
export interface NotificationFeed {
  reminders: CustomerTaskWithRelations[] | null
  priceAlerts: PriceAlert[] | null
  systemAlerts: SystemAlert[] | null
}

export async function getNotificationFeed(): Promise<NotificationFeed> {
  // allSettled: one failing source must not reject the whole feed.
  const [remindersRes, priceAlertsRes, systemAlertsRes] = await Promise.allSettled([
    getMyPendingReminders(),
    getUnreadPriceAlerts(),
    getSystemAlerts({ limit: 20 }),
  ])

  return {
    // getMyPendingReminders / getUnreadPriceAlerts resolve to [] on internal
    // error, so null here only happens if the action itself throws. Same
    // null=keep / []=empty contract, applied defensively.
    reminders: remindersRes.status === 'fulfilled' ? remindersRes.value : null,
    priceAlerts: priceAlertsRes.status === 'fulfilled' ? priceAlertsRes.value : null,
    // getSystemAlerts returns { success, data }: success:false is a real
    // error → null (keep existing). success with [] is a genuine empty list.
    systemAlerts:
      systemAlertsRes.status === 'fulfilled' &&
      systemAlertsRes.value.success &&
      systemAlertsRes.value.data
        ? systemAlertsRes.value.data
        : null,
  }
}
