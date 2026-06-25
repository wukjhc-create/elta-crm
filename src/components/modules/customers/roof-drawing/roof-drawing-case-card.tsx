'use client'

/**
 * Read-only oversigt over tagtegninger + total panelantal, til sags-detaljesiden.
 * Tegninger redigeres i besigtigelses-flowet; her vises de kun. Klik åbner
 * billedet i ny fane via den signed URL.
 */

import { useEffect, useState } from 'react'
import { LayoutGrid, Loader2, Sun } from 'lucide-react'
import { listRoofDrawings } from '@/lib/actions/roof-drawings'
import type { RoofDrawingWithUrl } from '@/types/roof-drawings.types'

interface RoofDrawingCaseCardProps {
  customerId: string | null
  serviceCaseId?: string | null
}

export function RoofDrawingCaseCard({ customerId, serviceCaseId }: RoofDrawingCaseCardProps) {
  const [drawings, setDrawings] = useState<RoofDrawingWithUrl[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!customerId && !serviceCaseId) {
      setLoading(false)
      return
    }
    let active = true
    listRoofDrawings({ customerId: customerId ?? null, serviceCaseId: serviceCaseId ?? null })
      .then((res) => {
        if (active && res.success && res.data) setDrawings(res.data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId, serviceCaseId])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (drawings.length === 0) return null

  const totalPanels = drawings.reduce((sum, d) => sum + (d.panel_count || 0), 0)

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Tagtegninger</h3>
        <span className="text-xs text-gray-400 ml-1">({drawings.length})</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Sun className="w-4 h-4 text-amber-500" />
          {totalPanels} paneler i alt
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
        {drawings.map((d) => (
          <a
            key={d.id}
            href={d.image_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="block border rounded-lg overflow-hidden hover:border-primary hover:shadow-sm transition-all"
          >
            <div className="aspect-video bg-gray-100 relative">
              {d.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.image_url} alt={d.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <LayoutGrid className="w-6 h-6" />
                </div>
              )}
              <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                <Sun className="w-3 h-3" />
                {d.panel_count}
              </span>
            </div>
            <div className="p-2">
              <span className="text-xs font-medium text-gray-900 truncate block">{d.title}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
