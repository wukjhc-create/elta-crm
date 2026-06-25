'use client'

import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, Plus, Loader2, Pencil, Sun } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { getSolarProductsByType } from '@/lib/actions/solar-products'
import { createRoofDrawing, listRoofDrawings } from '@/lib/actions/roof-drawings'
import {
  FALLBACK_PANEL_WIDTH_MM,
  FALLBACK_PANEL_HEIGHT_MM,
  type PanelProduct,
} from '@/types/solar-products.types'
import type { RoofDrawing, RoofDrawingWithUrl } from '@/types/roof-drawings.types'
import { RoofDrawingEditor } from './roof-drawing-editor'

interface RoofDrawingSectionProps {
  customerId: string
  serviceCaseId?: string | null
}

const MAX_DIM = 1600
const QUALITY = 0.82

/** Komprimér + resize et billede klientside. Returnerer data-URI + endelige mål. */
async function processImage(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Billedet kunne ikke behandles. Brug JPG eller PNG.'))
      image.src = objectUrl
    })
    const { naturalWidth: nw, naturalHeight: nh } = img
    if (!nw || !nh) throw new Error('Ugyldig billed-dimension')
    const scale = Math.min(1, MAX_DIM / nw, MAX_DIM / nh)
    const w = Math.round(nw * scale)
    const h = Math.round(nh * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas ikke tilgængelig')
    ctx.drawImage(img, 0, 0, w, h)
    return { dataUrl: canvas.toDataURL('image/jpeg', QUALITY), width: w, height: h }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function RoofDrawingSection({ customerId, serviceCaseId }: RoofDrawingSectionProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [panels, setPanels] = useState<PanelProduct[]>([])
  const [drawings, setDrawings] = useState<RoofDrawingWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [panelsRes, drawingsRes] = await Promise.all([
        getSolarProductsByType(),
        listRoofDrawings({ serviceCaseId: serviceCaseId ?? null, customerId }),
      ])
      if (!active) return
      if (panelsRes.success && panelsRes.data) setPanels(panelsRes.data.panels)
      if (drawingsRes.success && drawingsRes.data) setDrawings(drawingsRes.data)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [customerId, serviceCaseId])

  const totalPanels = drawings.reduce((sum, d) => sum + (d.panel_count || 0), 0)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // tillad gen-upload af samme fil
    if (!file) return

    setUploading(true)
    try {
      const { dataUrl, width, height } = await processImage(file)
      // Default-panel = første i katalog (hvis nogen)
      const firstPanel = panels[0]
      const result = await createRoofDrawing({
        customerId,
        serviceCaseId: serviceCaseId ?? null,
        title: `Tagflade ${drawings.length + 1}`,
        imageBase64: dataUrl,
        imageWidth: width,
        imageHeight: height,
        panelProductCode: firstPanel?.code ?? null,
        panelWidthMm: firstPanel?.specifications?.width_mm ?? FALLBACK_PANEL_WIDTH_MM,
        panelHeightMm: firstPanel?.specifications?.height_mm ?? FALLBACK_PANEL_HEIGHT_MM,
      })
      if (result.success && result.data) {
        setDrawings((prev) => [...prev, result.data as RoofDrawingWithUrl])
        setEditingId(result.data.id)
        toast.success('Tagflade tilføjet')
      } else {
        toast.error(result.error || 'Kunne ikke tilføje tagflade')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunne ikke behandle billedet')
    } finally {
      setUploading(false)
    }
  }

  function handleSaved(updated: RoofDrawing) {
    setDrawings((prev) =>
      prev.map((d) => (d.id === updated.id ? { ...d, ...updated, image_url: d.image_url } : d)),
    )
  }

  function handleDeleted(id: string) {
    setDrawings((prev) => prev.filter((d) => d.id !== id))
    setEditingId(null)
  }

  const editing = drawings.find((d) => d.id === editingId) || null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-gray-900">Tagtegning & panellayout</h3>
        </div>
        <div className="flex items-center gap-3">
          {totalPanels > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Sun className="w-4 h-4 text-amber-500" />
              {totalPanels} paneler i alt
            </span>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Tilføj tagflade
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Upload et tagbillede (skærmklip, foto eller drone), sæt målestok med en referencelinje, og
        træk solpaneler ind i korrekt størrelsesforhold.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter tegninger…
        </div>
      ) : drawings.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500 border border-dashed rounded-lg">
          Ingen tagtegninger endnu.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drawings.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setEditingId(d.id)}
              className="text-left border rounded-lg overflow-hidden hover:border-primary hover:shadow-sm transition-all"
            >
              <div className="aspect-video bg-gray-100 relative">
                {d.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image_url} alt={d.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <LayoutGrid className="w-8 h-8" />
                  </div>
                )}
                <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                  <Sun className="w-3 h-3" />
                  {d.panel_count}
                </span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm font-medium text-gray-900 truncate">{d.title}</span>
                <Pencil className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <RoofDrawingEditor
          drawing={editing}
          panels={panels}
          onClose={() => setEditingId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
