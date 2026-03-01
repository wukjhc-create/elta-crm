'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  TrendingUp,
} from 'lucide-react'
import { getImportBatches } from '@/lib/actions/import'
import { formatDateTimeDK } from '@/lib/utils/format'

interface LMClassicImportPanelProps {
  supplierId: string
}

interface ImportStats {
  totalProducts: number
  lastImportDate: string | null
  lastImportRows: number
  lastNewProducts: number
  lastUpdatedPrices: number
  isStale: boolean
}

export function LMClassicImportPanel({ supplierId }: LMClassicImportPanelProps) {
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [supplierId])

  async function loadStats() {
    setLoading(true)
    try {
      const result = await getImportBatches({ supplier_id: supplierId })
      if (result.success && result.data) {
        const completedBatches = result.data.data.filter((b) => b.status === 'completed')
        const latest = completedBatches[0]

        const lastDate = latest?.created_at || null
        const isStale = lastDate
          ? (Date.now() - new Date(lastDate).getTime()) > 7 * 24 * 60 * 60 * 1000
          : true

        setStats({
          totalProducts: latest?.total_rows || 0,
          lastImportDate: lastDate,
          lastImportRows: latest?.total_rows || 0,
          lastNewProducts: latest?.new_products || 0,
          lastUpdatedPrices: latest?.updated_products || 0,
          isStale,
        })
      }
    } catch {
      // Ignore errors
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" />
          Lemvigh-Müller Classic Import
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Priser importeres via CSV fra{' '}
          <a
            href="https://classic.lemu.dk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            classic.lemu.dk
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Package className="w-4 h-4" />
            Produkter
          </div>
          <p className="text-2xl font-bold">
            {stats?.totalProducts?.toLocaleString('da-DK') || '0'}
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Clock className="w-4 h-4" />
            Seneste import
          </div>
          <p className="text-sm font-medium">
            {stats?.lastImportDate ? formatDateTimeDK(stats.lastImportDate) : 'Aldrig'}
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <TrendingUp className="w-4 h-4" />
            Seneste ændringer
          </div>
          <p className="text-sm font-medium">
            {stats?.lastNewProducts || 0} nye, {stats?.lastUpdatedPrices || 0} opdateret
          </p>
        </div>
      </div>

      {/* Stale warning */}
      {stats?.isStale && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {stats.lastImportDate
                ? 'Prisdata er ældre end 7 dage'
                : 'Ingen prisliste importeret'}
            </p>
            <p className="mt-1">
              Upload en ny CSV-prisliste fra Classic Portal for at sikre opdaterede priser.
            </p>
          </div>
        </div>
      )}

      {/* Status indicator */}
      {stats && !stats.isStale && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          Prisdata er opdateret
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Link href={`/dashboard/settings/suppliers/${supplierId}/import`}>
          <Button>
            <Upload className="w-4 h-4 mr-2" />
            Upload prisliste
          </Button>
        </Link>
        <a href="https://classic.lemu.dk" target="_blank" rel="noopener noreferrer">
          <Button variant="outline">
            <ExternalLink className="w-4 h-4 mr-2" />
            Åbn Classic Portal
          </Button>
        </a>
      </div>

      {/* How to */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h4 className="font-medium text-sm mb-2">Sådan eksporterer du prislisten</h4>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>Log ind på <strong>classic.lemu.dk</strong> med dine kundeoplysninger</li>
          <li>Gå til &quot;Prislister&quot; eller &quot;Eksport&quot;</li>
          <li>Vælg CSV-format med semikolon som separator</li>
          <li>Download filen og upload den her</li>
        </ol>
      </div>
    </div>
  )
}
