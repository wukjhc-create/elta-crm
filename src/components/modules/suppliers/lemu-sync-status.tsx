'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Server, Clock, Package, Wifi, WifiOff } from 'lucide-react'
import { getLemuSyncStatus, triggerLemuSync, type LemuSyncStatus } from '@/lib/actions/lemu-sync'
import { useToast } from '@/components/ui/toast'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Aldrig'
  const d = new Date(iso)
  return d.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LemuSyncStatus() {
  const toast = useToast()
  const [status, setStatus] = useState<LemuSyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getLemuSyncStatus()
    if (result.success && result.data) setStatus(result.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    const result = await triggerLemuSync()
    setSyncing(false)

    if (result.success && result.data) {
      toast.success(
        `LEMU sync færdig: ${result.data.products_updated} opdateret, ${result.data.products_new} nye, ${result.data.price_changes} prisændringer`
      )
      load() // Refresh status
    } else {
      toast.error(result.error || 'Synkronisering fejlede')
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Henter LEMU status...</span>
        </div>
      </div>
    )
  }

  if (!status) return null

  const isConfigured = status.connection_configured
  const lastStatus = status.last_sync_status
  const isSuccess = lastStatus === 'success'
  const isFailed = lastStatus === 'failed'

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 sm:p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isConfigured ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Server className={`w-5 h-5 ${isConfigured ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Lemvigh-Müller (SFTP)</h3>
              <p className="text-xs text-gray-500">
                Automatisk prisimport via SFTP — /FromLEMU/pricelist/
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConfigured ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <Wifi className="w-3 h-3" /> Forbundet
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                <WifiOff className="w-3 h-3" /> Ikke konfigureret
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Last sync */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Clock className="w-3.5 h-3.5" />
              Sidste synk
            </div>
            <p className="text-sm font-medium text-gray-900">
              {formatDate(status.last_sync_at)}
            </p>
          </div>

          {/* Status */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Status</div>
            {lastStatus ? (
              <div className="flex items-center gap-1.5">
                {isSuccess && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {isFailed && <XCircle className="w-4 h-4 text-red-500" />}
                {!isSuccess && !isFailed && lastStatus !== null && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
                <span className={`text-sm font-medium ${
                  isSuccess ? 'text-green-700' : isFailed ? 'text-red-700' : 'text-amber-700'
                }`}>
                  {isSuccess ? 'OK' : isFailed ? 'Fejl' : lastStatus}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
          </div>

          {/* Products */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Package className="w-3.5 h-3.5" />
              Produkter
            </div>
            <p className="text-sm font-medium text-gray-900">
              {status.product_count.toLocaleString('da-DK')}
            </p>
          </div>

          {/* Duration */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Varighed</div>
            <p className="text-sm font-medium text-gray-900">
              {status.last_sync_duration_ms ? formatDuration(status.last_sync_duration_ms) : '—'}
            </p>
          </div>
        </div>

        {/* Sync button */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {status.last_sync_items !== null && status.last_sync_items > 0
              ? `Sidst behandlet: ${status.last_sync_items.toLocaleString('da-DK')} varer`
              : 'Klik for at hente friske priser fra Lemvigh-Müller'}
          </p>
          <button
            onClick={handleSync}
            disabled={syncing || !isConfigured}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {syncing ? 'Synkroniserer...' : 'Synkroniser nu'}
          </button>
        </div>
      </div>
    </div>
  )
}
