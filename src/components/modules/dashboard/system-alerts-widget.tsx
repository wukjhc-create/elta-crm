'use client'

import { useState, useEffect } from 'react'
import { getSystemAlerts, dismissAlert, markAlertRead } from '@/lib/actions/calculation-intelligence'
import { useToast } from '@/components/ui/toast'
import type { SystemAlert } from '@/types/calculation-intelligence.types'

const SEVERITY_STYLES = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  critical: 'bg-red-50 border-red-200 text-red-800',
}

const SEVERITY_ICONS = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  critical: 'text-red-500',
}

const TYPE_LABELS: Record<string, string> = {
  price_increase: 'Prisstigning',
  price_decrease: 'Prisfald',
  margin_below: 'Lav margin',
  supplier_offline: 'Leverandør',
  anomaly_detected: 'Anomali',
  sync_failed: 'Sync fejl',
}

export function SystemAlertsWidget() {
  const toast = useToast()
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAlerts() {
      const result = await getSystemAlerts({ is_read: false, limit: 5 })
      if (result.success && result.data) {
        setAlerts(result.data)
      }
      setLoading(false)
    }
    loadAlerts()
  }, [])

  const handleDismiss = async (id: string) => {
    const result = await dismissAlert(id)
    if (result.success) {
      setAlerts((prev) => prev.filter((a) => a.id !== id))
    } else {
      toast.error('Kunne ikke afvise advarsel')
    }
  }

  const handleMarkRead = async (id: string) => {
    const result = await markAlertRead(id)
    if (result.success) {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
      )
    } else {
      toast.error('Kunne ikke markere som læst')
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-gray-100 animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-4">
        Ingen aktive advarsler
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`border rounded-lg p-3 text-sm ${SEVERITY_STYLES[alert.severity as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.info}`}
        >
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-2 flex-1">
              <span className={`mt-0.5 ${SEVERITY_ICONS[alert.severity as keyof typeof SEVERITY_ICONS] || SEVERITY_ICONS.info}`}>
                {alert.severity === 'critical' ? '!!' : alert.severity === 'warning' ? '!' : 'i'}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs uppercase opacity-60">
                    {TYPE_LABELS[alert.alert_type] || alert.alert_type}
                  </span>
                </div>
                <p className="font-medium">{alert.title}</p>
                <p className="text-xs opacity-75 mt-0.5">{alert.message}</p>
              </div>
            </div>
            <button
              className="text-xs opacity-50 hover:opacity-100 ml-2"
              onClick={() => handleDismiss(alert.id)}
              title="Afvis"
              aria-label="Afvis advarsel"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
