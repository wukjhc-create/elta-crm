'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ruler,
  Plus,
  RotateCw,
  Trash2,
  Save,
  X,
  Loader2,
  Sun,
  ZoomIn,
  ZoomOut,
  Maximize,
  Magnet,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { saveRoofDrawing, deleteRoofDrawing } from '@/lib/actions/roof-drawings'
import {
  FALLBACK_PANEL_WIDTH_MM,
  FALLBACK_PANEL_HEIGHT_MM,
  type PanelProduct,
} from '@/types/solar-products.types'
import {
  DEFAULT_PANEL_GAP_MM,
  type RoofDrawing,
  type RoofDrawingWithUrl,
  type RoofDrawingData,
  type PanelPlacement,
} from '@/types/roof-drawings.types'

type Mode = 'view' | 'scale' | 'panels'

const MIN_SCALE = 0.5
const MAX_SCALE = 8

interface RoofDrawingEditorProps {
  drawing: RoofDrawingWithUrl
  panels: PanelProduct[]
  onClose: () => void
  onSaved: (updated: RoofDrawing) => void
  onDeleted: (id: string) => void
}

/**
 * Map klient-pixels til et SVG-elements lokale koordinatsystem via dets CTM.
 * - `target = svg`  → user-space (viewBox = naturlige billed-px, FØR view-transform).
 * - `target = <g>`  → indholds-koordinater (naturlige billed-px, EFTER zoom/pan).
 */
function clientToEl(
  svg: SVGSVGElement,
  target: SVGGraphicsElement,
  clientX: number,
  clientY: number,
) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = target.getScreenCTM()
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

/** Overlapper to 1D-intervaller (med tolerance) — bruges til at gate snap-akser. */
function nearRange(aMin: number, aMax: number, bMin: number, bMax: number, tol: number) {
  return aMin < bMax + tol && aMax > bMin - tol
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
  const contentRef = useRef<SVGGElement>(null)

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

  // View-transform (ren UI-tilstand, gemmes ikke): zoom + pan af tegnefladen.
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })

  // Snapping (Trin 2): nabo-snap til/fra + aktive guide-linjer under træk.
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })

  // Aktiv gesture-state (refs for at undgå stale closures)
  const lineDrag = useRef(false)
  const panelDrag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  // Aktive pointers (til multi-touch pinch/pan) + sidste pinch-tilstand.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ d: number; mx: number; my: number } | null>(null)

  /** Klient-px → user-space (viewBox, før view-transform). Til zoom-ankre. */
  function clientToUserSpace(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    return clientToEl(svg, svg, clientX, clientY)
  }

  /** Klient-px → indholds-koordinater (naturlige billed-px, efter zoom/pan). Til geometri. */
  function clientToContent(clientX: number, clientY: number) {
    const svg = svgRef.current
    const g = contentRef.current
    if (!svg || !g) return { x: 0, y: 0 }
    return clientToEl(svg, g, clientX, clientY)
  }

  /**
   * Zoom om et user-space-ankerpunkt, så indholdspunktet under ankret bliver
   * stående. Bevarer pan. `factor` ganges på scale (clampes).
   */
  function zoomAround(anchorX: number, anchorY: number, factor: number) {
    setView((v) => {
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const f = newScale / v.scale
      return {
        scale: newScale,
        tx: anchorX - f * (anchorX - v.tx),
        ty: anchorY - f * (anchorY - v.ty),
      }
    })
  }

  function zoomButtons(factor: number) {
    zoomAround(W / 2, H / 2, factor)
  }

  function resetView() {
    setView({ scale: 1, tx: 0, ty: 0 })
  }

  // Hjul-zoom (non-passiv listener så preventDefault virker; ankrer på musen).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const mp = clientToEl(svg, svg, e.clientX, e.clientY)
      setView((v) => {
        const newScale = clamp(
          v.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1),
          MIN_SCALE,
          MAX_SCALE,
        )
        const f = newScale / v.scale
        return {
          scale: newScale,
          tx: mp.x - f * (mp.x - v.tx),
          ty: mp.y - f * (mp.y - v.ty),
        }
      })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  const mmPerPx = data.mmPerPx
  const hasScale = !!mmPerPx && mmPerPx > 0
  const gapPx = hasScale ? data.panelGapMm / (mmPerPx as number) : 0

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

  /**
   * Nabo-snap: justér et trukket panels (nx,ny) så dets kanter flugter med /
   * støder op mod nærmeste panel (med panelGapMm afstand). X og Y vælges
   * uafhængigt og kun fra paneler der er nær på den anden akse, så man kan
   * starte en ny række under en eksisterende. Returnerer også guide-linjer.
   */
  function snapPanelPosition(panelId: string, nx: number, ny: number, dw: number, dh: number) {
    if (!snapEnabled || !panelPx) return { x: nx, y: ny, guideX: null, guideY: null }
    const thr = Math.max(8, Math.min(dw, dh) * 0.2)
    let bestX = { d: thr, val: nx, guide: null as number | null }
    let bestY = { d: thr, val: ny, guide: null as number | null }
    for (const o of data.panels) {
      if (o.id === panelId) continue
      const or = rectFor(o)
      if (!or) continue
      const { x: ox, y: oy } = o
      const ow = or.w
      const oh = or.h
      // X-kandidater (kun hvis paneler er lodret nær hinanden).
      if (nearRange(ny, ny + dh, oy, oy + oh, dh)) {
        const cands: Array<{ val: number; guide: number }> = [
          { val: ox, guide: ox }, // flugt venstre kant
          { val: ox + ow - dw, guide: ox + ow }, // flugt højre kant
          { val: ox + ow + gapPx, guide: ox + ow + gapPx }, // stød til højre for o
          { val: ox - gapPx - dw, guide: ox - gapPx }, // stød til venstre for o
        ]
        for (const c of cands) {
          const d = Math.abs(c.val - nx)
          if (d < bestX.d) bestX = { d, val: c.val, guide: c.guide }
        }
      }
      // Y-kandidater (kun hvis paneler er vandret nær hinanden).
      if (nearRange(nx, nx + dw, ox, ox + ow, dw)) {
        const cands: Array<{ val: number; guide: number }> = [
          { val: oy, guide: oy },
          { val: oy + oh - dh, guide: oy + oh },
          { val: oy + oh + gapPx, guide: oy + oh + gapPx },
          { val: oy - gapPx - dh, guide: oy - gapPx },
        ]
        for (const c of cands) {
          const d = Math.abs(c.val - ny)
          if (d < bestY.d) bestY = { d, val: c.val, guide: c.guide }
        }
      }
    }
    return { x: bestX.val, y: bestY.val, guideX: bestX.guide, guideY: bestY.guide }
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

  // ---- Pinch/pan (to-finger) ----
  /** Start (eller genstart) pinch ud fra de to første aktive pointers. */
  function beginPinch() {
    const pts = Array.from(pointers.current.values())
    if (pts.length < 2) return
    const [a, b] = pts
    pinch.current = {
      d: dist(a.x, a.y, b.x, b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    }
    // To-finger har forrang: afbryd evt. enkelt-finger-handlinger.
    lineDrag.current = false
    panelDrag.current = null
    setSnapGuides({ x: null, y: null })
    setPendingLine((l) => (l && dist(l.x1, l.y1, l.x2, l.y2) < 5 ? null : l))
  }

  function doPinch() {
    const pts = Array.from(pointers.current.values())
    if (pts.length < 2 || !pinch.current) return
    const [a, b] = pts
    const d1 = dist(a.x, a.y, b.x, b.y)
    const m1x = (a.x + b.x) / 2
    const m1y = (a.y + b.y) / 2
    const prev = pinch.current
    if (prev.d < 1 || d1 < 1) {
      pinch.current = { d: d1, mx: m1x, my: m1y }
      return
    }
    // Indholdspunktet under den forrige midte skal følge den nye midte, og
    // scale ændres med d1/prev.d om samme punkt.
    const mp0 = clientToUserSpace(prev.mx, prev.my)
    const mp1 = clientToUserSpace(m1x, m1y)
    setView((v) => {
      const newScale = clamp(v.scale * (d1 / prev.d), MIN_SCALE, MAX_SCALE)
      const f = newScale / v.scale
      return {
        scale: newScale,
        tx: mp1.x - f * (mp0.x - v.tx),
        ty: mp1.y - f * (mp0.y - v.ty),
      }
    })
    pinch.current = { d: d1, mx: m1x, my: m1y }
  }

  // ---- Målestok-gesture + pointer-routing ----
  function onSvgPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      beginPinch()
      return
    }
    if (mode !== 'scale') return
    const svg = svgRef.current
    if (!svg) return
    const { x, y } = clientToContent(e.clientX, e.clientY)
    lineDrag.current = true
    setPendingLine({ x1: x, y1: y, x2: x, y2: y })
    svg.setPointerCapture(e.pointerId)
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (pointers.current.size >= 2 && pinch.current) {
      doPinch()
      return
    }
    const { x, y } = clientToContent(e.clientX, e.clientY)

    if (lineDrag.current) {
      setPendingLine((l) => (l ? { ...l, x2: x, y2: y } : l))
      return
    }
    if (panelDrag.current && panelPx) {
      const drag = panelDrag.current
      const dragged = data.panels.find((p) => p.id === drag.id)
      const dr = dragged ? rectFor(dragged) : null
      const dw = dr?.w ?? panelPx.w
      const dh = dr?.h ?? panelPx.h
      const rawX = clamp(x - drag.offsetX, 0, W - dw)
      const rawY = clamp(y - drag.offsetY, 0, H - dh)
      const snapped = snapPanelPosition(drag.id, rawX, rawY, dw, dh)
      const nx = clamp(snapped.x, 0, W - dw)
      const ny = clamp(snapped.y, 0, H - dh)
      setData((d) => ({
        ...d,
        panels: d.panels.map((p) => (p.id === drag.id ? { ...p, x: nx, y: ny } : p)),
      }))
      setSnapGuides({ x: snapped.guideX, y: snapped.guideY })
    }
  }

  function onSvgPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
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
      setSnapGuides({ x: null, y: null })
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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      beginPinch()
      return
    }
    if (mode !== 'panels') return
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    setSelectedId(panel.id)
    const { x, y } = clientToContent(e.clientX, e.clientY)
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white shadow-xl flex flex-col w-full h-full max-h-full sm:h-auto sm:max-w-5xl sm:max-h-[95vh] sm:rounded-lg">
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

          <button
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap paneler sammen i rækker"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
              snapEnabled
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <Magnet className="w-4 h-4" />
            Snap
          </button>

          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            Afstand
            <input
              type="number"
              value={data.panelGapMm}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                patchData({ panelGapMm: Number.isFinite(v) && v >= 0 ? v : 0 })
              }}
              min="0"
              step="5"
              className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg"
            />
            mm
          </label>

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
        <div className="flex-1 min-h-0 relative bg-gray-100">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full bg-white touch-none select-none"
            style={{
              cursor: mode === 'scale' ? 'crosshair' : 'default',
            }}
            onPointerDown={onSvgPointerDown}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerCancel={onSvgPointerUp}
            onClick={() => {
              if (mode === 'panels') setSelectedId(null)
            }}
          >
            <g
              ref={contentRef}
              transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
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

              {/* Snap-guide-linjer (under træk) */}
              {(snapGuides.x !== null || snapGuides.y !== null) && (
                <g pointerEvents="none">
                  {snapGuides.x !== null && (
                    <line
                      x1={snapGuides.x}
                      y1={0}
                      x2={snapGuides.x}
                      y2={H}
                      stroke="#22c55e"
                      strokeWidth={W * 0.0015}
                      strokeDasharray={`${W * 0.01} ${W * 0.006}`}
                    />
                  )}
                  {snapGuides.y !== null && (
                    <line
                      x1={0}
                      y1={snapGuides.y}
                      x2={W}
                      y2={snapGuides.y}
                      stroke="#22c55e"
                      strokeWidth={W * 0.0015}
                      strokeDasharray={`${W * 0.01} ${W * 0.006}`}
                    />
                  )}
                </g>
              )}

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
            </g>
          </svg>

          {/* Zoom-knapper (touch-venlige, flyder over tegnefladen) */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => zoomButtons(1.25)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/95 border border-gray-300 shadow-sm hover:bg-gray-100 text-gray-700"
              aria-label="Zoom ind"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => zoomButtons(0.8)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/95 border border-gray-300 shadow-sm hover:bg-gray-100 text-gray-700"
              aria-label="Zoom ud"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/95 border border-gray-300 shadow-sm hover:bg-gray-100 text-gray-700"
              aria-label="Nulstil zoom"
            >
              <Maximize className="w-5 h-5" />
            </button>
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
    panelGapMm: typeof d.panelGapMm === 'number' ? d.panelGapMm : DEFAULT_PANEL_GAP_MM,
    panels: Array.isArray(d.panels) ? d.panels : [],
  }
}
