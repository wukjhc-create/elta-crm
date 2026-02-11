'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  Clock,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

interface HealthSummary {
  totalSuppliers: number
  onlineSuppliers: number
  offlineSuppliers: number
  freshCache: number
  staleCache: number
  missingCache: number
  lastGlobalSync: Date | null
  criticalIssues: string[]
}

interface SupplierHealthOverviewProps {
  className?: string
}

export function SupplierHealthOverview({ className }: SupplierHealthOverviewProps) {
  const toast = useToast()
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadSummary()
  }, [])

  async function loadSummary() {
    setLoading(true)
    try {
      const { getSystemHealthSummary } = await import('@/lib/actions/supplier-health')
      const result = await getSystemHealthSummary()
      if (result.success && result.data) {
        // Convert string date to Date object if needed
        setSummary({
          ...result.data,
          lastGlobalSync: result.data.lastGlobalSync ? new Date(result.data.lastGlobalSync) : null,
        })
      } else {
        setSummary(null)
        toast.error('Kunne ikke hente systemstatus')
      }
    } catch {
      setSummary(null)
      toast.error('Kunne ikke hente systemstatus')
    }
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadSummary()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className={`border rounded-lg p-6 bg-white ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className={`border rounded-lg p-6 bg-white ${className}`}>
        <div className="text-center py-4 text-gray-500">
          Kunne ikke hente leverandørstatus
        </div>
      </div>
    )
  }

  const hasIssues = summary.criticalIssues.length > 0

  return (
    <div className={`border rounded-lg bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Leverandør status</h3>
          {hasIssues && (
            <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">
              {summary.criticalIssues.length} problemer
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-3 divide-x">
        {/* Online Status */}
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            {summary.onlineSuppliers === summary.totalSuppliers ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : summary.onlineSuppliers > 0 ? (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <span className="text-2xl font-bold">
              {summary.onlineSuppliers}/{summary.totalSuppliers}
            </span>
          </div>
          <div className="text-xs text-gray-500">Online</div>
        </div>

        {/* Cache Status */}
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            {summary.freshCache === summary.totalSuppliers ? (
              <Database className="w-4 h-4 text-green-500" />
            ) : summary.freshCache > 0 ? (
              <Database className="w-4 h-4 text-yellow-500" />
            ) : (
              <Database className="w-4 h-4 text-red-500" />
            )}
            <span className="text-2xl font-bold">{summary.freshCache}</span>
          </div>
          <div className="text-xs text-gray-500">Frisk cache</div>
        </div>

        {/* Last Sync */}
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium">
              {summary.lastGlobalSync
                ? formatRelativeTime(summary.lastGlobalSync)
                : 'Aldrig'}
            </span>
          </div>
          <div className="text-xs text-gray-500">Sidste sync</div>
        </div>
      </div>

      {/* Issues */}
      {hasIssues && (
        <div className="p-4 border-t bg-red-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-red-800">
                Kritiske problemer
              </div>
              <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                {summary.criticalIssues.slice(0, 3).map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
                {summary.criticalIssues.length > 3 && (
                  <li>• +{summary.criticalIssues.length - 3} flere...</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Stale Cache Warning */}
      {summary.staleCache > 0 && !hasIssues && (
        <div className="p-4 border-t bg-yellow-50">
          <div className="flex items-center gap-2 text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            {summary.staleCache} leverandører har forældet cache
          </div>
        </div>
      )}

      {/* All Good */}
      {!hasIssues && summary.staleCache === 0 && summary.onlineSuppliers === summary.totalSuppliers && (
        <div className="p-4 border-t bg-green-50">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            Alle leverandører online med frisk data
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t">
        <Link href="/dashboard/settings/suppliers">
          <Button variant="ghost" size="sm" className="w-full">
            Se alle leverandører
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

// Helper to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Nu'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}t`
  if (diffDays === 1) return 'I går'
  return `${diffDays}d`
}
