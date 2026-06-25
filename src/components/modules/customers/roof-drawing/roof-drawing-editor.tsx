'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Ruler,
  Plus,
  RotateCw,
  Trash2,
  Save,
  X,
  Loader2,
  Sun,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { saveRoofDrawing, deleteRoofDrawing } from '@/lib/actions/roof-drawings'
import {
  FALLBACK_PANEL_WIDTH_MM,
  FALLBACK_PANEL_HEIGHT_MM,
  type PanelProduct,
} from '@/types/solar-products.types'
import type {
  RoofDrawing,
  RoofDrawingWithUrl,
  RoofDrawingData,
  PanelPlacement,
} from '@/types/roof-drawings.types'

type Mode = 'view' | 'scale' | 'panels'

interface RoofDrawingEditorProps {
  drawing: RoofDrawingWithUrl
  panels: PanelProduct[]
  onClose: () => void
  onSaved: (updated: RoofDrawing) => void
  onDeleted: (id: string) => void
}

/** Map klient-pixels til SVG user-space (naturlige billed-px). */
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1)
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

let panelSeq = 0
function newPanelId() {
  panelSeq += 1
  return `p_${panelSeq}_${Date.now().toString(36)}`
}

export function RoofDrawingEditor({
  drawing,
  panels,
  onClose,
  onSaved,
  onDeleted,
}: RoofDrawingEditorProps) {
  const toast = useToast()
  const svgRef = useRef<SVGSVGElement>(null)

  const [title, setTitle] = useState(drawing.title)
  const [panelCode, setPanelCode] = useState<string | null>(drawing.panel_product_code)
  const [data, setData] = useState<RoofDrawingData>(() => normalizeData(drawing.drawing_data))
  const [mode, setMode] = useState<Mode>('view')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingLine, setPendingLine] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const [lengthInput, setLengthInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const W = drawing.image_width
  const H = drawing.image_height

  // Aktiv gesture-state (refs for at undgå stale closures)
  const lineDrag = useRef(false)
  const panelDrag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  const mmPerPx = data.mmPerPx
  const hasScale = !!mmPerPx && mmPerPx > 0

  // Panel-px-størrelse ud fra valgt panels fysiske mål og målestok
  const panelPx = useMemo(() => {
    if (!hasScale) return null
    return {
      w: data.panelWidthMm / (mmPerPx as number),
      h: data.panelHeightMm / (mmPerPx as number),
    }
  }, [hasScale, mmPerPx, data.panelWidthMm, data.panelHeightMm])

  function patchData(patch: Partial<RoofDrawingData>) {
    setData((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  // ---- Panel-valg → opdatér fysiske mål i geometrien ----
  function handlePanelChange(code: string) {
    setPanelCode(code || null)
    const product = panels.find((p) => p.code === code)
    const wmm = product?.specifications?.width_mm ?? FALLBACK_PANEL_WIDTH_MM
    const hmm = product?.specifications?.height_mm ?? FALLBACK_PANEL_HEIGHT_MM
    patchData({ panelWidthMm: wmm, panelHeightMm: hmm })
  }

  const selectedPanelProduct = panels.find((p) => p.code === panelCode)
  const panelDimsAreFallback =
    !selectedPanelProduct?.specifications?.width_mm ||
    !selectedPanelProduct?.specifications?.height_mm

  // ---- Målestok-gesture ----
  function onSvgPointerDown(e: React.PointerEvent) {
    if (mode !== 'scale') return
    const svg = svgRef.current
    if (!svg) return
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY)
    lineDrag.current = true
    setPendingLine({ x1: x, y1: y, x2: x, y2: y })
    svg.setPointerCapture(e.pointerId)
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY)

    if (lineDrag.current) {
      setPendingLine((l) => (l ? { ...l, x2: x, y2: y } : l))
      return
    }
    if (panelDrag.current && panelPx) {
      const drag = panelDrag.current
      const nx = clamp(x - drag.offsetX, 0, W - panelPx.w)
      const ny = clamp(y - drag.offsetY, 0, H - panelPx.h)
      setData((d) => ({
        ...d,
        panels: d.panels.map((p) => (p.id === drag.id ? { ...p, x: nx, y: ny } : p)),
      }))
    }
  }

  function onSvgPointerUp(e: React.PointerEvent) {
    const svg = svgRef.current
    if (svg) {
      try {
        svg.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (lineDrag.current) {
      lineDrag.current = false
      setPendingLine((l) => {
        if (l && dist(l.x1, l.y1, l.x2, l.y2) < 5) return null // for kort = annullér
        return l
      })
    }
    if (panelDrag.current) {
      panelDrag.current = null
      setDirty(true)
    }
  }

  function confirmScale() {
    if (!pendingLine) return
    const meters = parseFloat(lengthInput.replace(',', '.'))
    if (!meters || meters <= 0) {
      toast.error('Indtast en gyldig længde i meter')
      return
    }
    const px = dist(pendingLine.x1, pendingLine.y1, pendingLine.x2, pendingLine.y2)
    if (px < 1) return
    const newMmPerPx = (meters * 1000) / px
    patchData({
      referenceLine: { ...pendingLine, realLengthMeters: meters },
      mmPerPx: newMmPerPx,
    })
    setPendingLine(null)
    setLengthInput('')
    setMode('view')
    toast.success('Målestok sat')
  }

  function cancelScale() {
    setPendingLine(null)
    setLengthInput('')
    lineDrag.current = false
  }

  // ---- Panel-handlinger ----
  function addPanel() {
    if (!panelPx) {
      toast.error('Sæt målestok først')
      return
    }
    if (!panelCode) {
      toast.error('Vælg et panel først')
      return
    }
    const idx = data.panels.length
    const x = clamp(W / 2 - panelPx.w / 2 + (idx % 5) * 10, 0, W - panelPx.w)
    const y = clamp(H / 2 - panelPx.h / 2 + (idx % 5) * 10, 0, H - panelPx.h)
    const panel: PanelPlacement = { id: newPanelId(), x, y, rotation: 0 }
    setData((d) => ({ ...d, panels: [...d.panels, panel] }))
    setSelectedId(panel.id)
    setDirty(true)
  }

  function rotateSelected() {
    if (!selectedId) return
    setData((d) => ({
      ...d,
      panels: d.panels.map((p) =>
        p.id === selectedId ? { ...p, rotation: p.rotation === 0 ? 90 : 0 } : p,
      ),
    }))
    setDirty(true)
  }

  function deleteSelected() {
    if (!selectedId) return
    setData((d) => ({ ...d, panels: d.panels.filter((p) => p.id !== selectedId) }))
    setSelectedId(null)
    setDirty(true)
  }

  function onPanelPointerDown(e: React.PointerEvent, panel: PanelPlacement) {
    if (mode !== 'panels') return
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    setSelectedId(panel.id)
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY)
    panelDrag.current = { id: panel.id, offsetX: x - panel.x, offsetY: y - panel.y }
    svg.setPointerCapture(e.pointerId)
  }

  // ---- Gem ----
  async function handleSave() {
    setSaving(true)
    const result = await saveRoofDrawing({
      id: drawing.id,
      title,
      panelProductCode: panelCode,
      panelCount: data.panels.length,
      drawingData: data,
    })
    setSaving(false)
    if (result.success && result.data) {
      setDirty(false)
      toast.success('Tegning gemt')
      onSaved(result.data)
    } else {
      toast.error(result.error || 'Kunne ikke gemme')
    }
  }

  async function handleDelete() {
    if (!confirm(`Slet tagfladen "${title}"?`)) return
    const result = await deleteRoofDrawing(drawing.id)
    if (result.success) {
      toast.success('Tagflade slettet')
      onDeleted(drawing.id)
    } else {
      toast.error(result.error || 'Kunne ikke slette')
    }
  }

  // Panel-rektangel-mål afhænger af rotation (byt bredde/højde)
  function rectFor(panel: PanelPlacement) {
    if (!panelPx) return null
    const w = panel.rotation === 0 ? panelPx.w : panelPx.h
    const h = panel.rotation === 0 ? panelPx.h : panelPx.w
    return { w, h }
  }

  // 1 m målestok-bar i px
  const meterBarPx = hasScale ? 1000 / (mmPerPx as number) : 0

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setDirty(true)
            }}
            className="text-lg font-semibold border-b border-transparent hover:border-gray-300 focus:border-primary outline-none"
          />
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50">
          <button
            onClick={() => {
              setMode((m) => (m === 'scale' ? 'view' : 'scale'))
              setSelectedId(null)
              cancelScale()
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
              mode === 'scale'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <Ruler className="w-4 h-4" />
            {hasScale ? 'Justér målestok' : 'Sæt målestok'}
          </button>

          <select
            value={panelCode ?? ''}
            onChange={(e) => handlePanelChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white"
          >
            <option value="">Vælg panel…</option>
            {panels.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setMode((m) => (m === 'panels' ? 'view' : 'panels'))
              cancelScale()
            }}
            disabled={!hasScale || !panelCode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border disabled:opacity-50 ${
              mode === 'panels'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <Sun className="w-4 h-4" />
            Panel-værktøj
          </button>

          <button
            onClick={addPanel}
            disabled={mode !== 'panels'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Tilføj panel
          </button>

          <button
            onClick={rotateSelected}
            disabled={!selectedId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            <RotateCw className="w-4 h-4" />
            Rotér
          </button>

          <button
            onClick={deleteSelected}
            disabled={!selectedId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Slet panel
          </button>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="font-medium text-gray-900">
              {data.panels.length} paneler
            </span>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Gem
            </button>
          </div>
        </div>

        {/* Mode-hint / scale-input */}
        {mode === 'scale' && (
          <div className="px-3 py-2 bg-amber-50 border-b text-sm text-amber-800 flex items-center gap-3 flex-wrap">
            {!pendingLine ? (
              <span>Træk en linje langs noget af kendt længde (fx husmur, garageport).</span>
            ) : (
              <>
                <span>Reel længde af linjen:</span>
                <input
                  type="number"
                  value={lengthInput}
                  onChange={(e) => setLengthInput(e.target.value)}
                  step="0.1"
                  min="0"
                  autoFocus
                  className="w-24 px-2 py-1 border rounded"
                  placeholder="meter"
                />
                <span>meter</span>
                <button
                  onClick={confirmScale}
                  className="px-3 py-1 rounded bg-primary text-white text-xs font-medium"
                >
                  Sæt målestok
                </button>
                <button onClick={cancelScale} className="px-3 py-1 rounded border text-xs">
                  Annullér
                </button>
              </>
            )}
          </div>
        )}
        {mode === 'panels' && panelDimsAreFallback && panelCode && (
          <div className="px-3 py-2 bg-amber-50 border-b text-xs text-amber-800">
            Det valgte panel mangler fysiske mål — bruger fallback{' '}
            {FALLBACK_PANEL_WIDTH_MM} × {FALLBACK_PANEL_HEIGHT_MM} mm. Ret målene under
            Solcelleindstillinger for korrekt størrelsesforhold.
          </div>
        )}

        {/* Tegneflade */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="mx-auto" style={{ maxWidth: 900 }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto border border-gray-300 bg-white touch-none select-none"
              style={{
                cursor: mode === 'scale' ? 'crosshair' : 'default',
              }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onClick={() => {
                if (mode === 'panels') setSelectedId(null)
              }}
            >
              {drawing.image_url && (
                <image
                  href={drawing.image_url}
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}

              {/* Committed referencelinje */}
              {data.referenceLine && (
                <ScaleLineGraphic
                  x1={data.referenceLine.x1}
                  y1={data.referenceLine.y1}
                  x2={data.referenceLine.x2}
                  y2={data.referenceLine.y2}
                  label={`${data.referenceLine.realLengthMeters} m`}
                  scale={W}
                />
              )}

              {/* Pending referencelinje under tegning */}
              {pendingLine && (
                <ScaleLineGraphic
                  x1={pendingLine.x1}
                  y1={pendingLine.y1}
                  x2={pendingLine.x2}
                  y2={pendingLine.y2}
                  scale={W}
                  dashed
                />
              )}

              {/* Paneler */}
              {panelPx &&
                data.panels.map((panel) => {
                  const r = rectFor(panel)
                  if (!r) return null
                  const isSel = panel.id === selectedId
                  return (
                    <rect
                      key={panel.id}
                      x={panel.x}
                      y={panel.y}
                      width={r.w}
                      height={r.h}
                      rx={Math.min(r.w, r.h) * 0.04}
                      fill={isSel ? 'rgba(37,99,235,0.45)' : 'rgba(37,99,235,0.30)'}
                      stroke={isSel ? '#1d4ed8' : '#1e3a8a'}
                      strokeWidth={W * 0.0025}
                      onPointerDown={(e) => onPanelPointerDown(e, panel)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: mode === 'panels' ? 'move' : 'default' }}
                    />
                  )
                })}

              {/* 1 m målestok-bar */}
              {hasScale && (
                <g>
                  <rect
                    x={W * 0.02}
                    y={H - H * 0.04}
                    width={meterBarPx}
                    height={H * 0.008}
                    fill="#111827"
                  />
                  <text
                    x={W * 0.02}
                    y={H - H * 0.05}
                    fontSize={W * 0.018}
                    fill="#111827"
                  >
                    1 m
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
            Slet tagflade
          </button>
          <button onClick={onClose} className="px-4 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
            Luk
          </button>
        </div>
      </div>
    </div>
  )
}

/** Referencelinje med endepunkts-markører. `scale` = billedbredde til linje-tykkelse. */
function ScaleLineGraphic({
  x1,
  y1,
  x2,
  y2,
  label,
  scale,
  dashed,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  label?: string
  scale: number
  dashed?: boolean
}) {
  const sw = scale * 0.004
  const r = scale * 0.006
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#dc2626"
        strokeWidth={sw}
        strokeDasharray={dashed ? `${sw * 3} ${sw * 2}` : undefined}
      />
      <circle cx={x1} cy={y1} r={r} fill="#dc2626" />
      <circle cx={x2} cy={y2} r={r} fill="#dc2626" />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - r}
          fontSize={scale * 0.02}
          fill="#dc2626"
          fontWeight="bold"
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  )
}

/** Sikr at en (evt. tom/legacy) drawing_data har alle felter. */
function normalizeData(raw: RoofDrawingData | Record<string, unknown> | null): RoofDrawingData {
  const d = (raw ?? {}) as Partial<RoofDrawingData>
  return {
    referenceLine: d.referenceLine ?? null,
    mmPerPx: typeof d.mmPerPx === 'number' ? d.mmPerPx : null,
    panelWidthMm: typeof d.panelWidthMm === 'number' ? d.panelWidthMm : FALLBACK_PANEL_WIDTH_MM,
    panelHeightMm: typeof d.panelHeightMm === 'number' ? d.panelHeightMm : FALLBACK_PANEL_HEIGHT_MM,
    panels: Array.isArray(d.panels) ? d.panels : [],
  }
}
