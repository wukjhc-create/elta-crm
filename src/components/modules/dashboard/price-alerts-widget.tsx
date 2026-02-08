'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import { getPriceAlertSummary, getPriceChangeAlerts } from '@/lib/actions/price-analytics'
import type { PriceChangeAlert } from '@/lib/actions/price-analytics'
import Link from 'next/link'

export function PriceAlertsWidget() {
  const [summary, setSummary] = useState<{
    totalAlerts: number
    priceIncreases: number
    priceDecreases: number
    affectedOffers: number
    criticalAlerts: number
  } | null>(null)
  const [recentAlerts, setRecentAlerts] = useState<PriceChangeAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [summaryRes, alertsRes] = await Promise.all([
        getPriceAlertSummary(),
        getPriceChangeAlerts({ threshold: 5, limit: 5, daysBack: 7 }),
      ])
      if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data)
      if (alertsRes.success && alertsRes.data) setRecentAlerts(alertsRes.data)
      setIsLoading(false)
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-12 bg-gray-200 rounded" />
        <div className="h-12 bg-gray-200 rounded" />
      </div>
    )
  }

  if (!summary || (summary.totalAlerts === 0 && recentAlerts.length === 0)) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        Ingen prisadvarsler de seneste 7 dage
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className={`text-xl font-bold ${summary.criticalAlerts > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {summary.criticalAlerts}
          </div>
          <div className="text-xs text-gray-500">Kritiske</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-amber-600">{summary.affectedOffers}</div>
          <div className="text-xs text-gray-500">Ber. tilbud</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{summary.totalAlerts}</div>
          <div className="text-xs text-gray-500">Ændringer</div>
        </div>
      </div>

      {/* Recent alerts list */}
      {recentAlerts.length > 0 && (
        <div className="space-y-2">
          {recentAlerts.map((alert) => {
            const isIncrease = alert.change_direction === 'increase'
            return (
              <div key={alert.id} className="flex items-center gap-2 text-sm">
                {isIncrease ? (
                  <TrendingUp className="h-3.5 w-3.5 text-red-500 shrink-0" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-green-500 shrink-0" />
                )}
                <span className="truncate flex-1 text-gray-700">{alert.product_name}</span>
                <span className={`text-xs font-medium shrink-0 ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>
                  {isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Link to full page */}
      <Link
        href="/dashboard/pricing"
        className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:text-blue-800 pt-2 border-t"
      >
        Se alle prisadvarsler
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
