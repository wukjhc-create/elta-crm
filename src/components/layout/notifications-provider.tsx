'use client'

/**
 * NotificationsProvider — Sprint Performance 1.
 *
 * Single source for the dashboard notification feed. Polls getNotificationFeed()
 * ONCE every 60 s (visibility-gated) and shares the result with both the
 * TaskReminderOverlay (reminders + price alerts) and the NotificationDropdown
 * (system alerts) via context.
 *
 * Before: 3 always-mounted components each ran their own 60 s poll → 4 server
 * action invocations / minute. After: 1 invocation / minute, paused entirely
 * when the tab is hidden.
 *
 * Local mutations (complete/snooze/dismiss/mark-read) update the shared state
 * through the exposed setters so the optimistic UX is unchanged. A per-list
 * change check avoids re-rendering consumers when a poll returns identical
 * data (preserves the overlay's no-layout-shift behaviour).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { getNotificationFeed } from '@/lib/actions/notifications'
import { useVisiblePolling } from '@/lib/hooks/use-visible-polling'
import type { PriceAlert } from '@/lib/actions/customer-tasks'
import type { CustomerTaskWithRelations } from '@/types/customer-tasks.types'
import type { SystemAlert } from '@/types/calculation-intelligence.types'

const POLL_INTERVAL = 60_000 // 60 s

type Updater<T> = T[] | ((prev: T[]) => T[])

interface NotificationsContextValue {
  reminders: CustomerTaskWithRelations[]
  priceAlerts: PriceAlert[]
  systemAlerts: SystemAlert[]
  setReminders: (u: Updater<CustomerTaskWithRelations>) => void
  setPriceAlerts: (u: Updater<PriceAlert>) => void
  setSystemAlerts: (u: Updater<SystemAlert>) => void
  refresh: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

function sameIds(a: { id: string }[], b: { id: string }[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((x) => x.id))
  for (const x of b) if (!ids.has(x.id)) return false
  return true
}

// System alerts also flip is_read without changing the id set, so the read
// flag is part of the equality check.
function sameAlerts(a: SystemAlert[], b: SystemAlert[]): boolean {
  if (a.length !== b.length) return false
  const map = new Map(a.map((x) => [x.id, x.is_read]))
  for (const x of b) {
    if (!map.has(x.id) || map.get(x.id) !== x.is_read) return false
  }
  return true
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [reminders, setRemindersState] = useState<CustomerTaskWithRelations[]>([])
  const [priceAlerts, setPriceAlertsState] = useState<PriceAlert[]>([])
  const [systemAlerts, setSystemAlertsState] = useState<SystemAlert[]>([])

  // Refs mirror state so the poll can diff against the latest values
  // (including optimistic local mutations) without stale closures.
  const remindersRef = useRef<CustomerTaskWithRelations[]>([])
  const priceAlertsRef = useRef<PriceAlert[]>([])
  const systemAlertsRef = useRef<SystemAlert[]>([])

  const setReminders = useCallback((u: Updater<CustomerTaskWithRelations>) => {
    setRemindersState((prev) => {
      const next = typeof u === 'function' ? u(prev) : u
      remindersRef.current = next
      return next
    })
  }, [])

  const setPriceAlerts = useCallback((u: Updater<PriceAlert>) => {
    setPriceAlertsState((prev) => {
      const next = typeof u === 'function' ? u(prev) : u
      priceAlertsRef.current = next
      return next
    })
  }, [])

  const setSystemAlerts = useCallback((u: Updater<SystemAlert>) => {
    setSystemAlertsState((prev) => {
      const next = typeof u === 'function' ? u(prev) : u
      systemAlertsRef.current = next
      return next
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const feed = await getNotificationFeed()
      // null = this slice failed to fetch → keep existing state untouched.
      // [] = a genuine empty result → safe to apply.
      if (feed.reminders !== null && !sameIds(remindersRef.current, feed.reminders)) {
        remindersRef.current = feed.reminders
        setRemindersState(feed.reminders)
      }
      if (feed.priceAlerts !== null && !sameIds(priceAlertsRef.current, feed.priceAlerts)) {
        priceAlertsRef.current = feed.priceAlerts
        setPriceAlertsState(feed.priceAlerts)
      }
      if (feed.systemAlerts !== null && !sameAlerts(systemAlertsRef.current, feed.systemAlerts)) {
        systemAlertsRef.current = feed.systemAlerts
        setSystemAlertsState(feed.systemAlerts)
      }
    } catch {
      // Non-critical — keep last good data.
    }
  }, [])

  useVisiblePolling(load, POLL_INTERVAL)

  const value: NotificationsContextValue = {
    reminders,
    priceAlerts,
    systemAlerts,
    setReminders,
    setPriceAlerts,
    setSystemAlerts,
    refresh: load,
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider')
  }
  return ctx
}
