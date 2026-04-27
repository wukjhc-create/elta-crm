'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Package, Wifi, WifiOff, Clock, Server } from 'lucide-react'
import { getAllSupplierSyncStatuses, triggerLemuSync, type SupplierSyncOverview } from '@/lib/actions/lemu-sync'
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

function SupplierBadge({ code }: { code: string }) {
  const colors = code === 'AO'
    ? 'bg-orange-500 text-white'
    : code === 'LM'
      ? 'bg-blue-600 text-white'
      : 'bg-gray-500 text-white'
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold ${colors}`}>
      {code}
    </span>
  )
}

function StatusBadge({ status, configured }: { status: string | null; configured: boolean }) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <WifiOff className="w-3 h-3" /> Offline
      </span>
    )
  }
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <Clock className="w-3 h-3" /> Afventer
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Wifi className="w-3 h-3" /> Online
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Fejl
    </span>
  )
}

export function SupplierSyncOverviewPanel() {
  const toast = useToast()
  const [suppliers, setSuppliers] = useState<SupplierSyncOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingCode, setSyncingCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getAllSupplierSyncStatuses()
    if (result.success && result.data) {
      setSuppliers(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async (code: string) => {
    setSyncingCode(code)
    if (code === 'LM') {
      const result = await triggerLemuSync()
      if (result.success && result.data) {
        toast.success(
          `LEMU sync: ${result.data.products_updated} opdateret, ${result.data.products_new} nye, ${result.data.price_changes} prisændringer`
        )
      } else {
        toast.error(result.error || 'Synkronisering fejlede')
      }
    } else {
      toast.error(`Manuel synkronisering for ${code} er ikke implementeret endnu.`)
    }
    setSyncingCode(null)
    load()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Henter leverandørstatus...</span>
        </div>
      </div>
    )
  }

  if (suppliers.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6 text-center text-sm text-gray-500">
        <Server className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        Ingen leverandører konfigureret
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
        Leverandør-integrationer
      </h3>

      <div className="grid gap-3">
        {suppliers.map((s) => (
          <div
            key={s.code}
            className={`bg-white rounded-lg border p-4 ${
              s.connection_configured && s.last_sync_status === 'success'
                ? 'border-green-200'
                : !s.connection_configured
                  ? 'border-gray-200 opacity-75'
                  : 'border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <SupplierBadge code={s.code} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-900">{s.name}</h4>
                  <StatusBadge status={s.last_sync_status} configured={s.connection_configured} />
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    {s.product_count.toLocaleString('da-DK')} produkter
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(s.last_sync_at)}
                  </span>
                  {s.last_sync_duration_ms && (
                    <span>{formatDuration(s.last_sync_duration_ms)}</span>
                  )}
                  <span className="uppercase text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {s.protocol}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleSync(s.code)}
                disabled={syncingCode === s.code || !s.connection_configured}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {syncingCode === s.code ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Synk
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
