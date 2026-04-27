'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, FileText, CheckCircle2 } from 'lucide-react'
import { getMonthlyOfferStats } from '@/lib/actions/dashboard'
import { useRealtimeTable } from '@/lib/hooks/use-realtime'

function formatDKK(value: number): string {
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(value)
}

export function MonthlyOfferChart() {
  const [stats, setStats] = useState<{
    sentValue: number
    acceptedValue: number
    sentCount: number
    acceptedCount: number
  } | null>(null)

  const loadStats = useCallback(async () => {
    const data = await getMonthlyOfferStats()
    setStats(data)
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Realtime: refresh when offers change
  useRealtimeTable('offers', loadStats)

  if (!stats) return null

  const maxValue = Math.max(stats.sentValue, stats.acceptedValue, 1)
  const sentPct = Math.round((stats.sentValue / maxValue) * 100)
  const acceptedPct = Math.round((stats.acceptedValue / maxValue) * 100)
  const monthName = new Date().toLocaleDateString('da-DK', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" />
          Tilbudsoversigt — {monthName}
        </h3>
      </div>

      {/* Sent */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-gray-600">
            <FileText className="w-3.5 h-3.5 text-blue-500" />
            Sendte tilbud ({stats.sentCount})
          </span>
          <span className="font-bold text-gray-900">{formatDKK(stats.sentValue)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${sentPct}%` }}
          />
        </div>
      </div>

      {/* Accepted */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-gray-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            Accepterede tilbud ({stats.acceptedCount})
          </span>
          <span className="font-bold text-gray-900">{formatDKK(stats.acceptedValue)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-700"
            style={{ width: `${acceptedPct}%` }}
          />
        </div>
      </div>

      {/* Conversion rate */}
      {stats.sentCount + stats.acceptedCount > 0 && (
        <div className="text-xs text-gray-500 pt-1 border-t">
          Hitrate: {stats.sentCount + stats.acceptedCount > 0 ? Math.round((stats.acceptedCount / (stats.sentCount + stats.acceptedCount)) * 100) : 0}% accepteret denne måned
        </div>
      )}
    </div>
  )
}
