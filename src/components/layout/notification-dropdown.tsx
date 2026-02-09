'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, X, AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { getSystemAlerts, markAlertRead, dismissAlert } from '@/lib/actions/calculation-intelligence'
import type { SystemAlert, AlertSeverity } from '@/types/calculation-intelligence.types'
import { formatTimeAgo } from '@/lib/utils/format'

const SEVERITY_CONFIG: Record<AlertSeverity, { icon: typeof Info; bgClass: string; textClass: string; dotClass: string }> = {
  info: { icon: Info, bgClass: 'bg-blue-50', textClass: 'text-blue-600', dotClass: 'bg-blue-500' },
  warning: { icon: AlertTriangle, bgClass: 'bg-amber-50', textClass: 'text-amber-600', dotClass: 'bg-amber-500' },
  critical: { icon: AlertCircle, bgClass: 'bg-red-50', textClass: 'text-red-600', dotClass: 'bg-red-500' },
}

const POLL_INTERVAL_MS = 60000 // 1 minute

export function NotificationDropdown() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadAlerts = useCallback(async () => {
    try {
      const result = await getSystemAlerts({ limit: 20 })
      if (result.success && result.data) {
        setAlerts(result.data)
        setUnreadCount(result.data.filter((a) => !a.is_read).length)
      }
    } catch {
      // Silent fail — alerts are not critical
    }
  }, [])

  // Initial load + polling
  useEffect(() => {
    loadAlerts()
    const interval = setInterval(loadAlerts, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadAlerts])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleMarkRead = async (id: string) => {
    const result = await markAlertRead(id)
    if (result.success) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true, read_at: new Date().toISOString() } : a)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }

  const handleDismiss = async (id: string) => {
    const result = await dismissAlert(id)
    if (result.success) {
      setAlerts((prev) => prev.filter((a) => a.id !== id))
      setUnreadCount((prev) => {
        const alert = alerts.find((a) => a.id === id)
        return alert && !alert.is_read ? Math.max(0, prev - 1) : prev
      })
    }
  }

  const handleMarkAllRead = async () => {
    setIsLoading(true)
    const unread = alerts.filter((a) => !a.is_read)
    await Promise.allSettled(unread.map((a) => markAlertRead(a.id)))
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true, read_at: new Date().toISOString() })))
    setUnreadCount(0)
    setIsLoading(false)
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-md transition-colors"
        aria-label={`Notifikationer${unreadCount > 0 ? ` (${unreadCount} ulæste)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-96 max-h-[480px] bg-white rounded-lg shadow-lg border z-50 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Notifikationer"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Notifikationer</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={isLoading}
                  className="text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50"
                >
                  Markér alle som læst
                </button>
              )}
            </div>
          </div>

          {/* Alert list */}
          <div className="overflow-y-auto flex-1">
            {alerts.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                Ingen notifikationer
              </div>
            ) : (
              alerts.map((alert) => {
                const config = SEVERITY_CONFIG[alert.severity]
                const Icon = config.icon
                return (
                  <div
                    key={alert.id}
                    className={`px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                      !alert.is_read ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`flex-shrink-0 p-1.5 rounded-full ${config.bgClass}`}>
                        <Icon className={`w-4 h-4 ${config.textClass}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium text-gray-900 ${!alert.is_read ? 'font-semibold' : ''}`}>
                            {alert.title}
                          </p>
                          {!alert.is_read && (
                            <span className={`flex-shrink-0 w-2 h-2 mt-1.5 rounded-full ${config.dotClass}`} />
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{alert.message}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-gray-400">{formatTimeAgo(alert.created_at)}</span>
                          <div className="flex items-center gap-1">
                            {!alert.is_read && (
                              <button
                                onClick={() => handleMarkRead(alert.id)}
                                className="text-xs text-gray-400 hover:text-primary flex items-center gap-0.5"
                                aria-label="Markér som læst"
                              >
                                <Check className="w-3 h-3" />
                                Læst
                              </button>
                            )}
                            <button
                              onClick={() => handleDismiss(alert.id)}
                              className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-0.5"
                              aria-label="Afvis"
                            >
                              <X className="w-3 h-3" />
                              Afvis
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div className="border-t px-4 py-2">
              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push('/dashboard')
                }}
                className="text-xs text-primary hover:text-primary/80 font-medium w-full text-center"
              >
                Se alle advarsler på dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
