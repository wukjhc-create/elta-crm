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
  Mail,
  MailCheck,
  MailX,
} from 'lucide-react'
import Link from 'next/link'
import { formatTimeAgo } from '@/lib/utils/format'

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

interface EmailSyncHealth {
  lastSync: Date | null
  lastStatus: string
  lastError: string | null
  totalSynced: number
  unidentifiedCount: number
  aoMatchCount: number
}

interface SupplierHealthOverviewProps {
  className?: string
}

export function SupplierHealthOverview({ className }: SupplierHealthOverviewProps) {
  const toast = useToast()
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [emailSync, setEmailSync] = useState<EmailSyncHealth | null>(null)
  const [syncFailed, setSyncFailed] = useState(false)
  const [statsFailed, setStatsFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [{ getSystemHealthSummary }, { getGraphSyncState, getIncomingEmailStats }] =
          await Promise.all([
            import('@/lib/actions/supplier-health'),
            import('@/lib/actions/incoming-emails'),
          ])

        const [result, syncOutcome, statsOutcome] = await Promise.all([
          getSystemHealthSummary(),
          getGraphSyncState().then((state) => ({ state, failed: false })).catch(() => ({ state: null, failed: true })),
          getIncomingEmailStats().then((stats) => ({ stats, failed: false })).catch(() => ({ stats: null, failed: true })),
        ])

        if (cancelled) return

        if (result.success && result.data) {
          setSummary({
            ...result.data,
            lastGlobalSync: result.data.lastGlobalSync ? new Date(result.data.lastGlobalSync) : null,
          })
        } else {
          setSummary(null)
        }

        setSyncFailed(syncOutcome.failed)
        setStatsFailed(statsOutcome.failed)
        const syncState = syncOutcome.state
        setEmailSync(syncOutcome.failed ? null : {
          lastSync: syncState?.last_sync_at ? new Date(syncState.last_sync_at) : null,
          lastStatus: syncState?.last_sync_status || 'never',
          lastError: syncState?.last_sync_error || null,
          totalSynced: syncState?.emails_synced_total || 0,
          unidentifiedCount: statsOutcome.stats?.unidentified ?? 0,
          aoMatchCount: statsOutcome.stats?.aoMatches ?? 0,
        })
      } catch {
        if (cancelled) return
        setSummary(null)
        toast.error('Kunne ikke hente systemstatus')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSummary() {
    setLoading(true)
    try {
      const [{ getSystemHealthSummary }, { getGraphSyncState, getIncomingEmailStats }] =
        await Promise.all([
          import('@/lib/actions/supplier-health'),
          import('@/lib/actions/incoming-emails'),
        ])

      const [result, syncOutcome, statsOutcome] = await Promise.all([
        getSystemHealthSummary(),
        getGraphSyncState().then((state) => ({ state, failed: false })).catch(() => ({ state: null, failed: true })),
        getIncomingEmailStats().then((stats) => ({ stats, failed: false })).catch(() => ({ stats: null, failed: true })),
      ])

      if (result.success && result.data) {
        setSummary({
          ...result.data,
          lastGlobalSync: result.data.lastGlobalSync ? new Date(result.data.lastGlobalSync) : null,
        })
      } else {
        setSummary(null)
        toast.error('Kunne ikke hente systemstatus')
      }

      setSyncFailed(syncOutcome.failed)
      setStatsFailed(statsOutcome.failed)
      const syncState = syncOutcome.state
      setEmailSync(syncOutcome.failed ? null : {
        lastSync: syncState?.last_sync_at ? new Date(syncState.last_sync_at) : null,
        lastStatus: syncState?.last_sync_status || 'never',
        lastError: syncState?.last_sync_error || null,
        totalSynced: syncState?.emails_synced_total || 0,
        unidentifiedCount: statsOutcome.stats?.unidentified ?? 0,
        aoMatchCount: statsOutcome.stats?.aoMatches ?? 0,
      })
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
        <p className="text-sm text-red-700 break-words py-4" data-testid="supplier-health-load-error">
          Kunne ikke hente leverandørstatus. Det tælles ikke som 0 leverandører.
        </p>
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
                ? formatTimeAgo(summary.lastGlobalSync)
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

      {syncFailed && (
        <p className="text-sm text-red-700 break-words border-t p-4" data-testid="supplier-mail-sync-load-error">
          Mail-sync kunne ikke hentes. Det tælles ikke som ikke synket, og det tælles ikke som 0.
        </p>
      )}

      {statsFailed && (
        <p className="text-sm text-red-700 break-words border-t p-4" data-testid="supplier-mail-stats-load-error">
          Mailtællere kunne ikke hentes. Det tælles ikke som 0.
        </p>
      )}

      {/* Email Sync Status */}
      {emailSync && (
        <div className="border-t">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail className="w-4 h-4 text-gray-500" />
              Mail Bridge
            </div>
            {emailSync.lastStatus === 'success' ? (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                Online
              </Badge>
            ) : emailSync.lastStatus === 'failed' ? (
              <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">
                Fejl
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                Ikke synket
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x px-0 py-0">
            <div className="p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                {emailSync.lastStatus === 'success' ? (
                  <MailCheck className="w-3.5 h-3.5 text-green-500" />
                ) : emailSync.lastStatus === 'failed' ? (
                  <MailX className="w-3.5 h-3.5 text-red-500" />
                ) : (
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                )}
                <span className="text-lg font-bold">{emailSync.totalSynced}</span>
              </div>
              <div className="text-[10px] text-gray-500">Synkroniseret</div>
            </div>
            <div className="p-3 text-center">
              <div className="text-lg font-bold text-yellow-600">
                {statsFailed ? '—' : emailSync.unidentifiedCount}
              </div>
              <div className="text-[10px] text-gray-500">Uidentificerede</div>
            </div>
            <div className="p-3 text-center">
              <div className="text-lg font-bold text-blue-600">
                {statsFailed ? '—' : emailSync.aoMatchCount}
              </div>
              <div className="text-[10px] text-gray-500">AO-match</div>
            </div>
          </div>
          {emailSync.lastSync && (
            <div className="px-4 py-1.5 text-[10px] text-gray-400 text-center border-t">
              Sidst synkroniseret: {formatTimeAgo(emailSync.lastSync)}
            </div>
          )}
          {emailSync.lastError && (
            <div className="px-4 py-2 bg-red-50 border-t">
              <div className="text-xs text-red-700 break-words">{emailSync.lastError}</div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t flex gap-2">
        <Link href="/dashboard/settings/suppliers" className="flex-1">
          <Button variant="ghost" size="sm" className="w-full">
            Leverandører
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
        <Link href="/dashboard/mail" className="flex-1">
          <Button variant="ghost" size="sm" className="w-full">
            Mail
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

