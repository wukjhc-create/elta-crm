'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  CheckCircle2,
  Clock,
  X,
  ExternalLink,
  FileText,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import {
  getMyPendingReminders,
  completeCustomerTask,
  snoozeTask,
  getUnreadPriceAlerts,
  dismissPriceAlert,
} from '@/lib/actions/customer-tasks'
import type { PriceAlert } from '@/lib/actions/customer-tasks'
import { TASK_PRIORITY_CONFIG } from '@/types/customer-tasks.types'
import type { CustomerTaskWithRelations } from '@/types/customer-tasks.types'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'

const POLL_INTERVAL = 60_000 // 60 seconds

export function TaskReminderOverlay() {
  const [reminders, setReminders] = useState<CustomerTaskWithRelations[]>([])
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [isMinimized, setIsMinimized] = useState(false)

  const loadReminders = useCallback(async () => {
    try {
      const [taskData, alertData] = await Promise.all([
        getMyPendingReminders(),
        getUnreadPriceAlerts(),
      ])
      setReminders(taskData)
      setPriceAlerts(alertData)
    } catch {
      // Silently fail — non-critical
    }
  }, [])

  useEffect(() => {
    loadReminders()
    const interval = setInterval(loadReminders, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [loadReminders])

  const handleComplete = async (taskId: string) => {
    await completeCustomerTask(taskId)
    setReminders((prev) => prev.filter((r) => r.id !== taskId))
  }

  const handleSnooze = async (taskId: string, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60_000).toISOString()
    await snoozeTask(taskId, until)
    setReminders((prev) => prev.filter((r) => r.id !== taskId))
  }

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  const handleDismissAlert = async (alertId: string) => {
    await dismissPriceAlert(alertId)
    setPriceAlerts((prev) => prev.filter((a) => a.id !== alertId))
  }

  const visibleReminders = reminders.filter((r) => !dismissed.has(r.id))
  const totalVisible = visibleReminders.length + priceAlerts.length

  if (totalVisible === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 max-w-sm">
      {/* Minimized badge */}
      {isMinimized ? (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-full shadow-lg hover:bg-amber-600 transition-colors"
        >
          <Bell className="w-4 h-4" />
          <span className="text-sm font-medium">{totalVisible} notifikation{totalVisible > 1 ? 'er' : ''}</span>
        </motion.button>
      ) : (
        <>
          {/* Header */}
          <div className="w-full flex items-center justify-between px-3 py-2 bg-gray-900 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium">Notifikationer ({totalVisible})</span>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-gray-700 rounded"
              title="Minimer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Price alert cards */}
          <AnimatePresence mode="popLayout">
            {priceAlerts.map((alert) => (
              <PriceAlertCard
                key={`alert-${alert.id}`}
                alert={alert}
                onDismiss={() => handleDismissAlert(alert.id)}
              />
            ))}
          </AnimatePresence>

          {/* Reminder cards */}
          <AnimatePresence mode="popLayout">
            {visibleReminders.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onComplete={() => handleComplete(reminder.id)}
                onSnooze={(mins) => handleSnooze(reminder.id, mins)}
                onDismiss={() => handleDismiss(reminder.id)}
              />
            ))}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// =====================================================
// Price Alert Card
// =====================================================

function PriceAlertCard({
  alert,
  onDismiss,
}: {
  alert: PriceAlert
  onDismiss: () => void
}) {
  const severityColors = {
    critical: 'border-red-300 bg-red-50',
    warning: 'border-amber-300 bg-amber-50',
    info: 'border-blue-300 bg-blue-50',
  }
  const borderColor = severityColors[alert.severity as keyof typeof severityColors] || severityColors.info

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`w-full rounded-lg shadow-lg border overflow-hidden ${borderColor}`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
            </div>
            <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line line-clamp-2">{alert.message}</p>
          </div>
          <button
            onClick={onDismiss}
            className="p-0.5 hover:bg-white/50 rounded shrink-0"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
            alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
            alert.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            <AlertTriangle className="w-3 h-3" />
            {alert.severity === 'critical' ? 'Kritisk' : alert.severity === 'warning' ? 'Advarsel' : 'Info'}
          </span>
          <span className="text-xs text-gray-500">
            {format(new Date(alert.created_at), 'd. MMM HH:mm', { locale: da })}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <a
            href="/dashboard/pricing"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Se priser
          </a>
          <button
            onClick={onDismiss}
            className="px-2 py-1.5 text-xs font-medium border rounded hover:bg-white/50 transition-colors"
          >
            Afvis
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// =====================================================
// Task Reminder Card
// =====================================================

function ReminderCard({
  reminder,
  onComplete,
  onSnooze,
  onDismiss,
}: {
  reminder: CustomerTaskWithRelations
  onComplete: () => void
  onSnooze: (minutes: number) => void
  onDismiss: () => void
}) {
  const priorityCfg = TASK_PRIORITY_CONFIG[reminder.priority]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="w-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{reminder.title}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {reminder.offer && (
                <a
                  href={`/dashboard/offers/${reminder.offer.id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  <FileText className="w-3 h-3" />
                  {reminder.offer.offer_number}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {reminder.customer && (
                <a
                  href={`/dashboard/customers/${reminder.customer.id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  {reminder.customer.company_name}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-0.5 hover:bg-gray-100 rounded shrink-0"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${priorityCfg.bgColor} ${priorityCfg.color}`}>
            {priorityCfg.label}
          </span>
          {reminder.due_date && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(reminder.due_date), 'd. MMM HH:mm', { locale: da })}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-3">
          <button
            onClick={onComplete}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Udført
          </button>
          <button
            onClick={() => onSnooze(15)}
            className="px-2 py-1.5 text-xs font-medium border rounded hover:bg-gray-50 transition-colors"
          >
            15 min
          </button>
          <button
            onClick={() => onSnooze(60)}
            className="px-2 py-1.5 text-xs font-medium border rounded hover:bg-gray-50 transition-colors"
          >
            1 time
          </button>
          <button
            onClick={() => onSnooze(60 * 24)}
            className="px-2 py-1.5 text-xs font-medium border rounded hover:bg-gray-50 transition-colors"
          >
            I morgen
          </button>
        </div>
      </div>
    </motion.div>
  )
}
