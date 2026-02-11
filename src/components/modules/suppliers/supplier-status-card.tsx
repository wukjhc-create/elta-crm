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
  Clock,
  Database,
  Wifi,
  WifiOff,
  Loader2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { testSupplierAPIConnection, syncSupplierPrices } from '@/lib/actions/supplier-sync'
import { getSupplierHealth, type SupplierHealth } from '@/lib/actions/supplier-health'

interface SupplierStatusCardProps {
  supplierId: string
  supplierName: string
  supplierCode: string
  onSyncComplete?: () => void
}

export function SupplierStatusCard({
  supplierId,
  supplierName,
  supplierCode,
  onSyncComplete,
}: SupplierStatusCardProps) {
  const toast = useToast()
  const [status, setStatus] = useState<SupplierHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [supplierId])

  async function loadStatus() {
    setLoading(true)
    try {
      const result = await getSupplierHealth(supplierId)
      if (result.success && result.data) {
        setStatus(result.data)
      } else {
        setStatus(null)
        toast.error('Kunne ikke hente leverandørstatus')
      }
    } catch {
      setStatus(null)
      toast.error('Kunne ikke hente leverandørstatus')
    }
    setLoading(false)
  }

  async function handleTestConnection() {
    setTesting(true)
    const result = await testSupplierAPIConnection(supplierId)

    if (result.success && result.data) {
      if (result.data.success) {
        toast.success('Test OK', result.data.message)
      } else {
        toast.error('Test fejlet', result.data.message)
      }
      loadStatus()
    } else {
      toast.error('Fejl', result.error)
    }
    setTesting(false)
  }

  async function handleSync() {
    setSyncing(true)
    const result = await syncSupplierPrices(supplierId)

    if (result.success && result.data) {
      toast.success(
        'Synkronisering afsluttet',
        `${result.data.updatedProducts} produkter, ${result.data.priceChanges} prisændringer`
      )
      loadStatus()
      onSyncComplete?.()
    } else {
      toast.error('Synkronisering fejlede', result.error)
    }
    setSyncing(false)
  }

  if (loading) {
    return (
      <div className="border rounded-lg p-6 bg-white">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              status?.isOnline ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            {status?.isOnline ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold">{supplierName}</h3>
            <p className="text-sm text-gray-500">{supplierCode || 'Ingen kode'}</p>
          </div>
        </div>
        <Badge variant={status?.isOnline ? 'default' : 'secondary'} className={!status?.isOnline ? 'bg-red-100 text-red-800' : ''}>
          {status?.isOnline ? 'Online' : 'Offline'}
        </Badge>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Cache Status */}
        <div className="flex items-center gap-2">
          <Database
            className={`w-4 h-4 ${
              status?.cacheStatus === 'fresh'
                ? 'text-green-500'
                : status?.cacheStatus === 'stale'
                ? 'text-yellow-500'
                : 'text-gray-400'
            }`}
          />
          <div className="text-sm">
            <div className="text-gray-500">Cache</div>
            <div className="font-medium">
              {status?.cacheStatus === 'fresh'
                ? 'Frisk'
                : status?.cacheStatus === 'stale'
                ? 'Forældet'
                : 'Mangler'}
            </div>
          </div>
        </div>

        {/* Cached Products */}
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-500" />
          <div className="text-sm">
            <div className="text-gray-500">Cached produkter</div>
            <div className="font-medium">{status?.cachedProductCount || 0}</div>
          </div>
        </div>

        {/* Last Sync */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <div className="text-sm">
            <div className="text-gray-500">Sidste sync</div>
            <div className="font-medium">
              {status?.lastSuccessfulSync
                ? formatRelativeTime(new Date(status.lastSuccessfulSync))
                : 'Aldrig'}
            </div>
          </div>
        </div>

        {/* Failures */}
        <div className="flex items-center gap-2">
          {status?.failureCount && status.failureCount > 0 ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
          <div className="text-sm">
            <div className="text-gray-500">Fejl (seneste 10)</div>
            <div className="font-medium">{status?.failureCount || 0}</div>
          </div>
        </div>
      </div>

      {/* Response Time */}
      {status?.averageResponseTime && (
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
          <TrendingUp className="w-4 h-4" />
          Gns. svartid: {Math.round(status.averageResponseTime)}ms
        </div>
      )}

      {/* Warnings */}
      {status && !status.isOnline && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <div className="font-medium">Leverandør utilgængelig</div>
            <div>Systemet bruger cached priser. Priser kan være forældede.</div>
          </div>
        </div>
      )}

      {status?.cacheStatus === 'stale' && (
        <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5" />
          <div className="text-sm text-orange-800">
            <div className="font-medium">Cache forældet</div>
            <div>Kør synkronisering for at opdatere priser.</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestConnection}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Wifi className="w-4 h-4 mr-2" />
          )}
          Test forbindelse
        </Button>
        <Button
          size="sm"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Synkroniser
        </Button>
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

  if (diffMins < 1) return 'Lige nu'
  if (diffMins < 60) return `${diffMins} min siden`
  if (diffHours < 24) return `${diffHours} timer siden`
  if (diffDays === 1) return 'I går'
  if (diffDays < 7) return `${diffDays} dage siden`
  return date.toLocaleDateString('da-DK')
}
