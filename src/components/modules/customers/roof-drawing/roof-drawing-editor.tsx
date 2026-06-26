'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
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
  Grid3x3,
  Hand,
  MoveHorizontal,
  Frame,
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
  type RoofField,
} from '@/types/roof-drawings.types'

type Mode = 'view' | 'scale' | 'panels' | 'fill' | 'field'

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

/** Normalisér en vinkel (grader) til [0, 360). */
function normAngle(a: number) {
  const r = a % 360
  return r < 0 ? r + 360 : r
}

/** Mindste vinkelforskel (0–180°) mellem to vinkler i grader. */
function angleDiff(a: number, b: number) {
  const d = Math.abs(normAngle(a) - normAngle(b))
  return d > 180 ? 360 - d : d
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

let fieldSeq = 0
function newFieldId() {
  fieldSeq += 1
  return `f_${fieldSeq}_${Date.now().toString(36)}`
}

/** Cellenøgle til RoofField.removed-sættet (negative koordinater tilladt). */
function cellKey(r: number, c: number) {
  return `${r},${c}`
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
  // Valgt felt (gruppe) i 'field'-mode — styrer rotation/udvid/forhindringer.
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
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

  // Udfyld område (Trin 3): markerings-rektangel + orientering for gitter-fyld.
  const [fillRect, setFillRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  )
  const [fillOrientation, setFillOrientation] = useState<0 | 90>(0)
  const fillDrag = useRef(false)

  // Fri rotation (Trin 2): arbejdsvinkel der bruges af nye paneler + udfyld.
  // Drejes via rotations-håndtag på et valgt panel eller via det numeriske felt.
  const [activeAngle, setActiveAngle] = useState(0)
  const rotateDrag = useRef<{ id: string } | null>(null)
  // Felt-rotation (Trin 3): drej HELE feltet om dets centroid via gruppe-håndtag.
  const fieldRotateDrag = useRef<{ fieldId: string; cx: number; cy: number } | null>(null)

  // Auto-spring til "Udfyld felt" én gang når forudsætningerne er klar (engangs).
  const didAutoTool = useRef(false)

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

  // Klar til at lægge paneler først når BÅDE målestok er sat OG et panel valgt.
  const ready = hasScale && !!panelCode

  /** Skift værktøj (mode) og ryd op i igangværende handlinger/markering. */
  function selectTool(t: Mode) {
    setMode(t)
    setSelectedId(null)
    setSelectedFieldId(null)
    fieldRotateDrag.current = null
    setFillRect(null)
    cancelScale()
  }

  // Når forudsætningerne bliver opfyldt (eller ved åbning af en klar tegning),
  // hop én gang til Udfyld-feltet, så den primære handling er valgt fra start.
  useEffect(() => {
    if (didAutoTool.current) return
    if (ready) {
      didAutoTool.current = true
      setMode((m) => (m === 'view' ? 'fill' : m))
    }
  }, [ready])

  // Hvis et valgt felt forsvinder (tømt via forhindringer/formindsk, eller slettet),
  // ryd markeringen så håndtag/kontekst-række ikke hænger ved et dødt felt.
  useEffect(() => {
    if (selectedFieldId && !data.fields?.[selectedFieldId]) setSelectedFieldId(null)
  }, [data.fields, selectedFieldId])

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

  /**
   * Vinkel-snap: hopper let på plads ved nærmeste "pæne" vinkel — multipla af
   * 15° samt målestoks-referencelinjens vinkel (og vinkelret på den), da
   * paneler ofte ligger parallelt med en tagkant. Tvinges ikke: fri når
   * snapEnabled er slået fra, eller når ingen kandidat er inden for tærsklen.
   */
  function snapAngle(a: number) {
    if (!snapEnabled) return normAngle(a)
    const ANGLE_SNAP_THRESHOLD = 4 // grader
    const cands: number[] = []
    for (let k = 0; k < 360; k += 15) cands.push(k)
    const rl = data.referenceLine
    if (rl) {
      const ra = (Math.atan2(rl.y2 - rl.y1, rl.x2 - rl.x1) * 180) / Math.PI
      cands.push(ra, ra + 90, ra + 180, ra + 270)
    }
    let best = normAngle(a)
    let bestD = ANGLE_SNAP_THRESHOLD
    for (const c of cands) {
      const d = angleDiff(a, c)
      if (d < bestD) {
        bestD = d
        best = normAngle(c)
      }
    }
    return best
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
    rotateDrag.current = null
    fieldRotateDrag.current = null
    fillDrag.current = false
    setFillRect(null)
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
    const svg = svgRef.current
    if (!svg) return
    if (mode === 'scale') {
      const { x, y } = clientToContent(e.clientX, e.clientY)
      lineDrag.current = true
      setPendingLine({ x1: x, y1: y, x2: x, y2: y })
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (mode === 'fill' && panelPx) {
      const { x, y } = clientToContent(e.clientX, e.clientY)
      fillDrag.current = true
      setFillRect({ x1: x, y1: y, x2: x, y2: y })
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (mode === 'field') {
      // Baggrundstryk: genskab tom celle i valgt felt, ellers afvælg.
      const { x, y } = clientToContent(e.clientX, e.clientY)
      handleFieldBackgroundPress(x, y)
    }
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
    if (fillDrag.current) {
      setFillRect((r) => (r ? { ...r, x2: x, y2: y } : r))
      return
    }
    if (fieldRotateDrag.current) {
      const fr = fieldRotateDrag.current
      // Håndtaget sidder over feltets top → vinklen = retningen til pegeren + 90°.
      const phi = (Math.atan2(y - fr.cy, x - fr.cx) * 180) / Math.PI
      const target = snapAngle(phi + 90)
      setActiveAngle(target)
      applyFieldAngle(fr.fieldId, target)
      return
    }
    if (rotateDrag.current && panelPx) {
      const rot = rotateDrag.current
      const panel = data.panels.find((p) => p.id === rot.id)
      const r = panel ? rectFor(panel) : null
      if (panel && r) {
        const cx = panel.x + r.w / 2
        const cy = panel.y + r.h / 2
        // Håndtaget sidder over panelets top → vinklen = retningen til pegeren + 90°.
        const phi = (Math.atan2(y - cy, x - cx) * 180) / Math.PI
        const a = snapAngle(phi + 90)
        setActiveAngle(a)
        setData((d) => ({
          ...d,
          panels: d.panels.map((p) => (p.id === rot.id ? { ...p, angle: a } : p)),
        }))
      }
      return
    }
    if (panelDrag.current && panelPx) {
      const drag = panelDrag.current
      const dragged = data.panels.find((p) => p.id === drag.id)
      const dr = dragged ? rectFor(dragged) : null
      const dw = dr?.w ?? panelPx.w
      const dh = dr?.h ?? panelPx.h
      const ang = dragged?.angle ?? 0
      if (ang !== 0) {
        // Roteret panel: nabo-snap giver ikke mening (akse-justeret) → fri flyt,
        // og clamp kun panelets centrum inden for billedet.
        const ncx = clamp(x - drag.offsetX + dw / 2, 0, W)
        const ncy = clamp(y - drag.offsetY + dh / 2, 0, H)
        const nx = ncx - dw / 2
        const ny = ncy - dh / 2
        setData((d) => ({
          ...d,
          panels: d.panels.map((p) => (p.id === drag.id ? { ...p, x: nx, y: ny } : p)),
        }))
        setSnapGuides({ x: null, y: null })
      } else {
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
    if (rotateDrag.current) {
      rotateDrag.current = null
      setDirty(true)
    }
    if (fieldRotateDrag.current) {
      fieldRotateDrag.current = null
      setDirty(true)
    }
    if (panelDrag.current) {
      panelDrag.current = null
      setSnapGuides({ x: null, y: null })
      setDirty(true)
    }
    if (fillDrag.current) {
      fillDrag.current = false
      if (fillRect && dist(fillRect.x1, fillRect.y1, fillRect.x2, fillRect.y2) >= 10) {
        fillArea(fillRect)
      }
      setFillRect(null)
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
    const panel: PanelPlacement = { id: newPanelId(), x, y, rotation: 0, angle: activeAngle }
    setData((d) => ({ ...d, panels: [...d.panels, panel] }))
    setSelectedId(panel.id)
    setDirty(true)
  }

  /**
   * Omregn et (skærm-akse) markerings-rektangel til arbejdsvinklens frame.
   * Ankeret er trækkets startpunkt; vektoren til slutpunktet projiceres ind i
   * den roterede frame (R(-angle)). Returnerer lokal bredde/højde + cos/sin til
   * at mappe lokale gitter-celler tilbage til billed-koordinater.
   */
  function fillLocalRect(rect: { x1: number; y1: number; x2: number; y2: number }, angle: number) {
    const ax = rect.x1
    const ay = rect.y1
    const vx = rect.x2 - ax
    const vy = rect.y2 - ay
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const localX = vx * cos + vy * sin
    const localY = -vx * sin + vy * cos
    const lx0 = Math.min(0, localX)
    const ly0 = Math.min(0, localY)
    return { ax, ay, cos, sin, lx0, ly0, rw: Math.abs(localX), rh: Math.abs(localY) }
  }

  /**
   * Gitter-cellestørrelse + pitch for en given orientering ud fra de AKTUELLE
   * panelmål + gab. Udledes on-demand (gemmes ikke på feltet), så feltet ikke
   * kan "drifte" væk fra panelerne. Kald kun når panelPx findes.
   */
  function fieldGeom(orientation: 0 | 90) {
    const cw = orientation === 0 ? (panelPx?.w ?? 0) : (panelPx?.h ?? 0)
    const ch = orientation === 0 ? (panelPx?.h ?? 0) : (panelPx?.w ?? 0)
    return { cw, ch, pitchX: cw + gapPx, pitchY: ch + gapPx }
  }

  /**
   * Celle (r,c) → panel-placement i billed-px. Ankeret er feltets `origin`
   * (celle-(0,0)'s hjørne); cellecentret mappes via R(field.angle). Bruges af
   * både udfyld og udvid, så nye celler altid ligger i samme gitter-lattice.
   */
  function cellToPanel(field: RoofField, r: number, c: number): PanelPlacement {
    const { cw, ch, pitchX, pitchY } = fieldGeom(field.orientation)
    const rad = (field.angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const lcx = c * pitchX + cw / 2
    const lcy = r * pitchY + ch / 2
    const wcx = field.origin.x + lcx * cos - lcy * sin
    const wcy = field.origin.y + lcx * sin + lcy * cos
    return {
      id: newPanelId(),
      x: wcx - cw / 2,
      y: wcy - ch / 2,
      rotation: field.orientation,
      angle: field.angle,
      fieldId: field.id,
      cell: { r, c },
    }
  }

  /**
   * Billed-punkt → nærmeste celle (r,c) i feltets gitter (invers af cellToPanel,
   * R(-angle)). Bruges KUN til at finde hvilken celle brugeren rører — aldrig til
   * at identificere eksisterende paneler (det gør panelets eget `cell`-felt).
   */
  function worldToCell(field: RoofField, px: number, py: number) {
    const { cw, ch, pitchX, pitchY } = fieldGeom(field.orientation)
    const rad = (field.angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = px - field.origin.x
    const dy = py - field.origin.y
    const lx = dx * cos + dy * sin
    const ly = -dx * sin + dy * cos
    return { r: Math.round((ly - ch / 2) / pitchY), c: Math.round((lx - cw / 2) / pitchX) }
  }

  /** Paneler der hører til et felt (i nuværende rækkefølge). */
  function panelsOfField(fieldId: string) {
    return data.panels.filter((p) => p.fieldId === fieldId)
  }

  /** Centroid (gennemsnit af panelcentre) for en panelmængde, eller null hvis tom. */
  function panelsCentroid(ps: PanelPlacement[]) {
    let sx = 0
    let sy = 0
    let n = 0
    for (const p of ps) {
      const r = rectFor(p)
      if (!r) continue
      sx += p.x + r.w / 2
      sy += p.y + r.h / 2
      n++
    }
    return n ? { x: sx / n, y: sy / n } : null
  }

  /** Celle-omfang (min/max r,c) for et felts paneler, eller null hvis ingen celler. */
  function fieldExtent(ps: PanelPlacement[]) {
    let minR = Infinity
    let maxR = -Infinity
    let minC = Infinity
    let maxC = -Infinity
    for (const p of ps) {
      if (!p.cell) continue
      minR = Math.min(minR, p.cell.r)
      maxR = Math.max(maxR, p.cell.r)
      minC = Math.min(minC, p.cell.c)
      maxC = Math.max(maxC, p.cell.c)
    }
    if (!Number.isFinite(minR)) return null
    return { minR, maxR, minC, maxC }
  }

  /**
   * Udfyld et markeret rektangel med paneler i et gitter (pitch = panelmål +
   * gab). Gitteret bygges i arbejdsvinklens (activeAngle) frame, så hele feltet
   * følger tagets vinkel. Opretter et RoofField (gitter-anker/vinkel) og stempler
   * hvert panel med fieldId + cell, så feltet senere kan drejes/udvides samlet.
   */
  function fillArea(rect: { x1: number; y1: number; x2: number; y2: number }) {
    if (!panelPx) return
    const angle = activeAngle
    const { ax, ay, cos, sin, lx0, ly0, rw, rh } = fillLocalRect(rect, angle)
    const { cw, ch, pitchX, pitchY } = fieldGeom(fillOrientation)
    // n paneler fylder n*pitch - gab → n = floor((længde + gab) / pitch).
    const cols = Math.floor((rw + gapPx) / pitchX)
    const rows = Math.floor((rh + gapPx) / pitchY)
    if (cols < 1 || rows < 1) {
      toast.error('Området er for lille til et panel')
      return
    }
    const count = cols * rows
    if (count > 400 && !confirm(`Dette udfylder ${count} paneler. Fortsæt?`)) return
    // Feltets anker = celle-(0,0)'s hjørne (lokal (lx0,ly0)) mappet til billed-px.
    const field: RoofField = {
      id: newFieldId(),
      angle,
      orientation: fillOrientation,
      origin: { x: ax + lx0 * cos - ly0 * sin, y: ay + lx0 * sin + ly0 * cos },
      removed: [],
    }
    const newPanels: PanelPlacement[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newPanels.push(cellToPanel(field, r, c))
      }
    }
    setData((d) => ({
      ...d,
      panels: [...d.panels, ...newPanels],
      fields: { ...(d.fields ?? {}), [field.id]: field },
    }))
    setSelectedId(null)
    setSelectedFieldId(field.id)
    setDirty(true)
    toast.success(`${count} paneler tilføjet`)
  }

  // ---- Felt-handlinger (gruppe) ----

  /**
   * Drej HELE feltet til en absolut målvinkel: rotér hvert felt-panels CENTRUM
   * om feltets centroid med delta = target − nuværende vinkel, læg delta til hvert
   * panels egen `angle`, og rotér feltets `origin` med samme delta (så udvid-ankret
   * følger med). Kaldes løbende under træk (target er absolut → delta bliver
   * inkrementelt da field.angle opdateres hver gang).
   */
  function applyFieldAngle(fid: string, target: number) {
    setData((d) => {
      const field = d.fields?.[fid]
      if (!field) return d
      const ps = d.panels.filter((p) => p.fieldId === fid)
      const G = panelsCentroid(ps)
      if (!G) return d
      const delta = target - field.angle
      const rad = (delta * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const rot = (px: number, py: number) => ({
        x: G.x + (px - G.x) * cos - (py - G.y) * sin,
        y: G.y + (px - G.x) * sin + (py - G.y) * cos,
      })
      const panels = d.panels.map((p) => {
        if (p.fieldId !== fid) return p
        const r = rectFor(p)
        if (!r) return p
        const nc = rot(p.x + r.w / 2, p.y + r.h / 2)
        return { ...p, x: nc.x - r.w / 2, y: nc.y - r.h / 2, angle: normAngle((p.angle ?? 0) + delta) }
      })
      const no = rot(field.origin.x, field.origin.y)
      return {
        ...d,
        panels,
        fields: { ...d.fields, [fid]: { ...field, angle: normAngle(target), origin: no } },
      }
    })
    setDirty(true)
  }

  /** Fjern en celle som forhindring: registrér i removed + slet panelet. */
  function removeFieldCell(fid: string, r: number, c: number) {
    const key = cellKey(r, c)
    setData((d) => {
      const field = d.fields?.[fid]
      if (!field) return d
      const removed = field.removed.includes(key) ? field.removed : [...field.removed, key]
      return {
        ...d,
        panels: d.panels.filter(
          (p) => !(p.fieldId === fid && p.cell && p.cell.r === r && p.cell.c === c),
        ),
        fields: { ...d.fields, [fid]: { ...field, removed } },
      }
    })
    setDirty(true)
  }

  /** Genskab en tidligere fjernet celle: fjern fra removed + læg panel tilbage. */
  function restoreFieldCell(fid: string, r: number, c: number) {
    setData((d) => {
      const field = d.fields?.[fid]
      if (!field) return d
      if (d.panels.some((p) => p.fieldId === fid && p.cell && p.cell.r === r && p.cell.c === c)) {
        return d
      }
      const key = cellKey(r, c)
      return {
        ...d,
        panels: [...d.panels, cellToPanel(field, r, c)],
        fields: { ...d.fields, [fid]: { ...field, removed: field.removed.filter((k) => k !== key) } },
      }
    })
    setDirty(true)
  }

  /**
   * Udvid/formindsk feltet ved en kant. grow=true lægger en ny række/kolonne til
   * (springer celler i `removed` og allerede optagne over); grow=false fjerner den
   * yderste række/kolonne og rydder dens removed-nøgler. Tømmes feltet helt,
   * fjernes feltets metadata.
   */
  function extendField(fid: string, edge: 'top' | 'bottom' | 'left' | 'right', grow: boolean) {
    setData((d) => {
      const field = d.fields?.[fid]
      if (!field) return d
      const ps = d.panels.filter((p) => p.fieldId === fid)
      const ext = fieldExtent(ps)
      if (!ext) return d
      let panels = d.panels
      let removed = field.removed
      if (grow) {
        const cells: Array<{ r: number; c: number }> = []
        if (edge === 'left') for (let r = ext.minR; r <= ext.maxR; r++) cells.push({ r, c: ext.minC - 1 })
        if (edge === 'right') for (let r = ext.minR; r <= ext.maxR; r++) cells.push({ r, c: ext.maxC + 1 })
        if (edge === 'top') for (let c = ext.minC; c <= ext.maxC; c++) cells.push({ r: ext.minR - 1, c })
        if (edge === 'bottom') for (let c = ext.minC; c <= ext.maxC; c++) cells.push({ r: ext.maxR + 1, c })
        const add: PanelPlacement[] = []
        for (const cell of cells) {
          if (removed.includes(cellKey(cell.r, cell.c))) continue // respektér forhindring
          if (ps.some((p) => p.cell && p.cell.r === cell.r && p.cell.c === cell.c)) continue
          add.push(cellToPanel(field, cell.r, cell.c))
        }
        panels = [...d.panels, ...add]
      } else {
        const rmR = edge === 'top' ? ext.minR : edge === 'bottom' ? ext.maxR : null
        const rmC = edge === 'left' ? ext.minC : edge === 'right' ? ext.maxC : null
        panels = d.panels.filter((p) => {
          if (p.fieldId !== fid || !p.cell) return true
          if (rmC !== null && p.cell.c === rmC) return false
          if (rmR !== null && p.cell.r === rmR) return false
          return true
        })
        removed = removed.filter((k) => {
          const [rr, cc] = k.split(',').map(Number)
          if (rmC !== null && cc === rmC) return false
          if (rmR !== null && rr === rmR) return false
          return true
        })
      }
      const fields = { ...d.fields }
      if (panels.filter((p) => p.fieldId === fid).length === 0) {
        delete fields[fid]
      } else {
        fields[fid] = { ...field, removed }
      }
      return { ...d, panels, fields }
    })
    setDirty(true)
  }

  /** Slet et helt felt (alle dets paneler + metadata). */
  function removeSelectedField() {
    if (!selectedFieldId) return
    const fid = selectedFieldId
    if (!confirm('Slet hele feltet?')) return
    setData((d) => {
      const fields = { ...(d.fields ?? {}) }
      delete fields[fid]
      return { ...d, panels: d.panels.filter((p) => p.fieldId !== fid), fields }
    })
    setSelectedFieldId(null)
    setDirty(true)
  }

  /**
   * Felt-baggrundstryk: hvis et felt er valgt og trykket rammer en tom/fjernet
   * celle inden for feltets omfang → genskab den; ellers afvælg feltet.
   */
  function handleFieldBackgroundPress(x: number, y: number) {
    if (selectedFieldId) {
      const field = data.fields?.[selectedFieldId]
      const ps = panelsOfField(selectedFieldId)
      const ext = fieldExtent(ps)
      if (field && ext) {
        const { r, c } = worldToCell(field, x, y)
        if (r >= ext.minR && r <= ext.maxR && c >= ext.minC && c <= ext.maxC) {
          const occupied = ps.some((p) => p.cell && p.cell.r === r && p.cell.c === c)
          if (!occupied) {
            restoreFieldCell(selectedFieldId, r, c)
            return
          }
        }
      }
    }
    setSelectedFieldId(null)
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

  /**
   * Sæt arbejdsvinklen (numerisk felt). Bruges af nye paneler + udfyld. Hvis et
   * panel er valgt, drejes det også med det samme, så feltet og håndtaget styrer
   * det samme.
   */
  function applyAngle(a: number) {
    const na = normAngle(a)
    setActiveAngle(na)
    // I felt-mode drejer det numeriske felt HELE det valgte felt.
    if (mode === 'field' && selectedFieldId) {
      applyFieldAngle(selectedFieldId, na)
      return
    }
    if (selectedId) {
      setData((d) => ({
        ...d,
        panels: d.panels.map((p) => (p.id === selectedId ? { ...p, angle: na } : p)),
      }))
      setDirty(true)
    }
  }

  function deleteSelected() {
    if (!selectedId) return
    setData((d) => {
      const panel = d.panels.find((p) => p.id === selectedId)
      // Hører panelet til et felt → registrér cellen som forhindring, så en senere
      // udvid ikke uventet genskaber det.
      let fields = d.fields
      if (panel?.fieldId && panel.cell && d.fields?.[panel.fieldId]) {
        const f = d.fields[panel.fieldId]
        const key = cellKey(panel.cell.r, panel.cell.c)
        fields = {
          ...d.fields,
          [panel.fieldId]: { ...f, removed: f.removed.includes(key) ? f.removed : [...f.removed, key] },
        }
      }
      return { ...d, panels: d.panels.filter((p) => p.id !== selectedId), fields }
    })
    setSelectedId(null)
    setDirty(true)
  }

  function onPanelPointerDown(e: React.PointerEvent, panel: PanelPlacement) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      beginPinch()
      return
    }
    if (mode === 'field') {
      e.stopPropagation()
      const fid = panel.fieldId
      if (!fid || !data.fields?.[fid]) return // løse paneler er ikke valgbare i felt-mode
      if (fid !== selectedFieldId) {
        // Første tryk: vælg hele feltet (rotér/udvid via håndtag herefter).
        setSelectedFieldId(fid)
        setActiveAngle(data.fields[fid].angle)
      } else if (panel.cell) {
        // Allerede valgt → tryk på et panel fjerner det som forhindring.
        removeFieldCell(fid, panel.cell.r, panel.cell.c)
      }
      return
    }
    if (mode !== 'panels') return
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    setSelectedId(panel.id)
    setActiveAngle(panel.angle ?? 0)
    const { x, y } = clientToContent(e.clientX, e.clientY)
    panelDrag.current = { id: panel.id, offsetX: x - panel.x, offsetY: y - panel.y }
    svg.setPointerCapture(e.pointerId)
  }

  /** Start fri rotation når man griber fat i et valgt panels rotations-håndtag. */
  function onRotateHandlePointerDown(e: React.PointerEvent, panel: PanelPlacement) {
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
    rotateDrag.current = { id: panel.id }
    svg.setPointerCapture(e.pointerId)
  }

  /** Start rotation af HELE feltet når man griber feltets gruppe-håndtag. */
  function onFieldRotateHandlePointerDown(e: React.PointerEvent, fid: string) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      beginPinch()
      return
    }
    if (mode !== 'field') return
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const G = panelsCentroid(panelsOfField(fid))
    if (!G) return
    fieldRotateDrag.current = { fieldId: fid, cx: G.x, cy: G.y }
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

  // ---- Felt-render-tilstand ----
  const hasFields = !!data.fields && Object.keys(data.fields).length > 0
  const selectedField = selectedFieldId ? data.fields?.[selectedFieldId] ?? null : null
  const selectedFieldPanels = selectedFieldId ? panelsOfField(selectedFieldId) : []
  const selectedFieldExtent = fieldExtent(selectedFieldPanels)
  // Feltets bounding-rektangel i dets EGEN (roterede) frame — bruges til omrids,
  // rotations-håndtag og kant +/−-håndtag. Tegnes via translate(origin)+rotate(angle).
  const fieldBox =
    selectedField && selectedFieldExtent && panelPx
      ? (() => {
          const { cw, ch, pitchX, pitchY } = fieldGeom(selectedField.orientation)
          const { minR, maxR, minC, maxC } = selectedFieldExtent
          const left = minC * pitchX
          const top = minR * pitchY
          const right = (maxC + 1) * pitchX - gapPx
          const bottom = (maxR + 1) * pitchY - gapPx
          return { left, top, right, bottom, w: right - left, h: bottom - top, cw, ch, pitchX, pitchY }
        })()
      : null

  // Genbruges i både udfyld- og enkelt-panel-kontekstrækken.
  const gapField = (
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
  )

  const angleField = (
    <label
      className="flex items-center gap-1.5 text-sm text-gray-600"
      title="Vinkel for valgt panel + nye paneler/udfyld. Drej også via håndtaget på et valgt panel."
    >
      <RotateCw className="w-4 h-4 text-gray-400" />
      Vinkel
      <input
        type="number"
        value={Math.round(activeAngle)}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          applyAngle(Number.isFinite(v) ? v : 0)
        }}
        step="5"
        className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg"
      />
      °
    </label>
  )

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
          {/* Værktøjsvælger — vælg ét værktøj ad gangen (touch-venligt) */}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-300 p-1">
            <ToolButton
              active={mode === 'view'}
              onClick={() => selectTool('view')}
              icon={Hand}
              label="Vis"
            />
            <ToolButton
              active={mode === 'scale'}
              onClick={() => selectTool('scale')}
              icon={Ruler}
              label={hasScale ? 'Målestok' : 'Sæt målestok'}
            />
            <ToolButton
              active={mode === 'fill'}
              onClick={() => selectTool('fill')}
              icon={Grid3x3}
              label="Udfyld felt"
              disabled={!ready}
              primary
            />
            <ToolButton
              active={mode === 'field'}
              onClick={() => selectTool('field')}
              icon={Frame}
              label="Felt"
              disabled={!hasFields}
            />
            <ToolButton
              active={mode === 'panels'}
              onClick={() => selectTool('panels')}
              icon={Sun}
              label="Enkelt panel"
              disabled={!ready}
            />
          </div>

          <select
            value={panelCode ?? ''}
            onChange={(e) => handlePanelChange(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white"
          >
            <option value="">Vælg panel…</option>
            {panels.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>

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

        {/* Forudsætnings-guide — vis vejen til at lægge paneler når noget mangler */}
        {!ready && (
          <div className="px-3 py-2.5 bg-blue-50 border-b text-sm text-blue-900 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="font-semibold">Sådan lægger du paneler:</span>
            <GuideStep n={1} done={hasScale}>
              Sæt målestok
            </GuideStep>
            <GuideStep n={2} done={!!panelCode}>
              Vælg panel i listen
            </GuideStep>
            <GuideStep n={3} done={false}>
              Vælg «Udfyld felt» og træk hen over taget
            </GuideStep>
          </div>
        )}

        {/* Målestok-række */}
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

        {/* Fallback-mål-advarsel (gælder både udfyld og enkelt panel) */}
        {(mode === 'panels' || mode === 'fill') && panelDimsAreFallback && panelCode && (
          <div className="px-3 py-2 bg-amber-50 border-b text-xs text-amber-800">
            Det valgte panel mangler fysiske mål — bruger fallback{' '}
            {FALLBACK_PANEL_WIDTH_MM} × {FALLBACK_PANEL_HEIGHT_MM} mm. Ret målene under
            Solcelleindstillinger for korrekt størrelsesforhold.
          </div>
        )}

        {/* Udfyld-felt kontekst-række */}
        {mode === 'fill' && ready && (
          <div className="px-3 py-2 bg-blue-50 border-b text-sm text-blue-900 flex items-center gap-3 flex-wrap">
            <span className="font-medium flex items-center gap-1.5">
              <MoveHorizontal className="w-4 h-4 shrink-0" />
              Træk hen over taget — feltet fyldes med paneler på én bevægelse.
            </span>
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-white rounded-lg border p-0.5">
                <button
                  onClick={() => setFillOrientation(0)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium ${
                    fillOrientation === 0 ? 'bg-primary text-white' : 'text-gray-700'
                  }`}
                >
                  Stående
                </button>
                <button
                  onClick={() => setFillOrientation(90)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium ${
                    fillOrientation === 90 ? 'bg-primary text-white' : 'text-gray-700'
                  }`}
                >
                  Liggende
                </button>
              </div>
              {gapField}
              {angleField}
            </div>
          </div>
        )}

        {/* Enkelt-panel kontekst-række */}
        {mode === 'panels' && ready && (
          <div className="px-3 py-2 bg-gray-50 border-b flex items-center gap-2 flex-wrap">
            <button
              onClick={addPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
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
            {gapField}
            {angleField}
          </div>
        )}

        {/* Felt kontekst-række */}
        {mode === 'field' && (
          <div className="px-3 py-2 bg-indigo-50 border-b text-sm text-indigo-900 flex items-center gap-3 flex-wrap">
            {!selectedField ? (
              <span className="font-medium flex items-center gap-1.5">
                <Frame className="w-4 h-4 shrink-0" />
                Tryk på et felt for at vælge det — drej hele feltet, udvid med +/− i kanten,
                eller tryk et panel for at fjerne det ved en forhindring.
              </span>
            ) : (
              <>
                <span className="font-medium flex items-center gap-1.5">
                  <Frame className="w-4 h-4 shrink-0" />
                  {selectedFieldPanels.length} paneler i feltet — drej via håndtaget, +/− i
                  kanten udvider, tryk et panel = fjern (forhindring), tryk hul = genskab.
                </span>
                <div className="ml-auto flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setSnapEnabled((s) => !s)}
                    title="Snap feltets vinkel til tagkanten (målestoks-linjen) + 15°-spring"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      snapEnabled
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    <Magnet className="w-4 h-4" />
                    Snap
                  </button>
                  {angleField}
                  <button
                    onClick={removeSelectedField}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    Fjern felt
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tegneflade */}
        <div className="flex-1 min-h-0 relative bg-gray-100">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full bg-white touch-none select-none"
            style={{
              cursor: mode === 'scale' || mode === 'fill' ? 'crosshair' : 'default',
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

              {/* Paneler (sorte, evt. frit roterede om eget centrum) */}
              {panelPx &&
                data.panels.map((panel) => {
                  const r = rectFor(panel)
                  if (!r) return null
                  const isSel = panel.id === selectedId
                  const angle = panel.angle ?? 0
                  const cx = panel.x + r.w / 2
                  const cy = panel.y + r.h / 2
                  const showHandle = isSel && mode === 'panels'
                  const handleLen = Math.max(r.h * 0.6, H * 0.045)
                  const handleR = W * 0.012
                  return (
                    <g key={panel.id} transform={`rotate(${angle} ${cx} ${cy})`}>
                      <rect
                        x={panel.x}
                        y={panel.y}
                        width={r.w}
                        height={r.h}
                        rx={Math.min(r.w, r.h) * 0.04}
                        fill={isSel ? 'rgba(17,24,39,0.92)' : 'rgba(17,24,39,0.85)'}
                        stroke={isSel ? '#2563eb' : '#0b0f19'}
                        strokeWidth={isSel ? W * 0.004 : W * 0.0025}
                        onPointerDown={(e) => onPanelPointerDown(e, panel)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: mode === 'panels' ? 'move' : 'default' }}
                      />
                      {/* Rotations-håndtag (mus + touch) over panelets top-kant */}
                      {showHandle && (
                        <g>
                          <line
                            x1={cx}
                            y1={panel.y}
                            x2={cx}
                            y2={panel.y - handleLen}
                            stroke="#2563eb"
                            strokeWidth={W * 0.0025}
                          />
                          <circle
                            cx={cx}
                            cy={panel.y - handleLen}
                            r={handleR}
                            fill="#ffffff"
                            stroke="#2563eb"
                            strokeWidth={W * 0.003}
                            onPointerDown={(e) => onRotateHandlePointerDown(e, panel)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'grab' }}
                          />
                        </g>
                      )}
                    </g>
                  )
                })}

              {/* Felt-overlay: omrids + rotations-håndtag + kant +/− + hul-markører */}
              {mode === 'field' &&
                selectedField &&
                fieldBox &&
                (() => {
                  const { left, top, right, bottom } = fieldBox
                  const midX = (left + right) / 2
                  const midY = (top + bottom) / 2
                  const sw = W * 0.003
                  const pad = W * 0.04
                  const inset = Math.min(W * 0.03, fieldBox.w / 3, fieldBox.h / 3)
                  const btnR = W * 0.02
                  const rotR = W * 0.014
                  const rotY = top - pad - Math.max(H * 0.05, W * 0.05)
                  const ext = selectedFieldExtent
                  // Kant-knapper i feltets lokale frame: + (udvid, udenfor) / − (formindsk, indenfor).
                  const btns: Array<{
                    x: number
                    y: number
                    edge: 'top' | 'bottom' | 'left' | 'right'
                    grow: boolean
                  }> = [
                    { x: midX, y: top - pad, edge: 'top', grow: true },
                    { x: midX, y: top + inset, edge: 'top', grow: false },
                    { x: midX, y: bottom + pad, edge: 'bottom', grow: true },
                    { x: midX, y: bottom - inset, edge: 'bottom', grow: false },
                    { x: left - pad, y: midY, edge: 'left', grow: true },
                    { x: left + inset, y: midY, edge: 'left', grow: false },
                    { x: right + pad, y: midY, edge: 'right', grow: true },
                    { x: right - inset, y: midY, edge: 'right', grow: false },
                  ]
                  return (
                    <g
                      transform={`translate(${selectedField.origin.x} ${selectedField.origin.y}) rotate(${selectedField.angle})`}
                    >
                      {/* Hul-markører (fjernede celler) — tryk for at genskabe (via baggrund) */}
                      {ext &&
                        selectedField.removed.map((key) => {
                          const [r, c] = key.split(',').map(Number)
                          if (r < ext.minR || r > ext.maxR || c < ext.minC || c > ext.maxC) return null
                          return (
                            <rect
                              key={key}
                              x={c * fieldBox.pitchX}
                              y={r * fieldBox.pitchY}
                              width={fieldBox.cw}
                              height={fieldBox.ch}
                              fill="rgba(99,102,241,0.10)"
                              stroke="#6366f1"
                              strokeWidth={sw * 0.7}
                              strokeDasharray={`${W * 0.008} ${W * 0.006}`}
                              pointerEvents="none"
                            />
                          )
                        })}

                      {/* Omrids */}
                      <rect
                        x={left}
                        y={top}
                        width={fieldBox.w}
                        height={fieldBox.h}
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth={sw}
                        strokeDasharray={`${W * 0.012} ${W * 0.008}`}
                        pointerEvents="none"
                      />

                      {/* Rotations-håndtag for HELE feltet */}
                      <line x1={midX} y1={top} x2={midX} y2={rotY} stroke="#4f46e5" strokeWidth={sw} />
                      <circle
                        cx={midX}
                        cy={rotY}
                        r={rotR}
                        fill="#ffffff"
                        stroke="#4f46e5"
                        strokeWidth={sw}
                        onPointerDown={(e) => onFieldRotateHandlePointerDown(e, selectedField.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'grab' }}
                      />

                      {/* Kant +/−-håndtag */}
                      {btns.map((b, i) => (
                        <g
                          key={i}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            extendField(selectedField.id, b.edge, b.grow)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle
                            cx={b.x}
                            cy={b.y}
                            r={btnR}
                            fill={b.grow ? '#4f46e5' : '#ffffff'}
                            stroke="#4f46e5"
                            strokeWidth={sw}
                          />
                          {/* + / − tegn */}
                          <line
                            x1={b.x - btnR * 0.5}
                            y1={b.y}
                            x2={b.x + btnR * 0.5}
                            y2={b.y}
                            stroke={b.grow ? '#ffffff' : '#4f46e5'}
                            strokeWidth={sw}
                          />
                          {b.grow && (
                            <line
                              x1={b.x}
                              y1={b.y - btnR * 0.5}
                              x2={b.x}
                              y2={b.y + btnR * 0.5}
                              stroke="#ffffff"
                              strokeWidth={sw}
                            />
                          )}
                        </g>
                      ))}
                    </g>
                  )
                })()}

              {/* Udfyld-område markerings-rektangel (under træk) — roteret efter arbejdsvinklen */}
              {fillRect &&
                (() => {
                  const fl = fillLocalRect(fillRect, activeAngle)
                  return (
                    <g
                      transform={`translate(${fl.ax} ${fl.ay}) rotate(${activeAngle})`}
                      pointerEvents="none"
                    >
                      <rect
                        x={fl.lx0}
                        y={fl.ly0}
                        width={fl.rw}
                        height={fl.rh}
                        fill="rgba(37,99,235,0.12)"
                        stroke="#1d4ed8"
                        strokeWidth={W * 0.0025}
                        strokeDasharray={`${W * 0.01} ${W * 0.006}`}
                      />
                    </g>
                  )
                })()}

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

          {/* Vedvarende instruktion i udfyld-mode (touch) */}
          {mode === 'fill' && ready && !fillRect && (
            <div className="absolute inset-x-0 top-3 flex justify-center px-4 pointer-events-none">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/90 text-white text-sm font-medium shadow-lg">
                <MoveHorizontal className="w-4 h-4 shrink-0" />
                Træk hen over taget for at lægge et helt felt
              </div>
            </div>
          )}

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

/** Knap i den segmenterede værktøjsvælger (touch-venlig, ét aktivt værktøj). */
function ToolButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
  primary,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: ComponentType<{ className?: string }>
  label: string
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'bg-primary text-white shadow-sm'
          : primary
            ? 'text-primary hover:bg-primary/10'
            : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  )
}

/** Et trin i forudsætnings-guiden (nummereret, krydses ud når opfyldt). */
function GuideStep({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <span className={`flex items-center gap-1.5 ${done ? 'text-blue-400' : 'font-medium'}`}>
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
          done ? 'bg-blue-300 text-white' : 'bg-blue-600 text-white'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={done ? 'line-through' : ''}>{children}</span>
    </span>
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
  // Felt-metadata: behold kun velformede records (graciøs degradering ved skrald).
  const fields: Record<string, RoofField> = {}
  if (d.fields && typeof d.fields === 'object') {
    for (const [fid, f] of Object.entries(d.fields as Record<string, unknown>)) {
      const rf = f as Partial<RoofField>
      if (
        rf &&
        typeof rf.angle === 'number' &&
        rf.origin &&
        typeof rf.origin.x === 'number' &&
        typeof rf.origin.y === 'number'
      ) {
        fields[fid] = {
          id: fid,
          angle: rf.angle,
          orientation: rf.orientation === 90 ? 90 : 0,
          origin: { x: rf.origin.x, y: rf.origin.y },
          removed: Array.isArray(rf.removed) ? rf.removed.filter((k) => typeof k === 'string') : [],
        }
      }
    }
  }
  return {
    referenceLine: d.referenceLine ?? null,
    mmPerPx: typeof d.mmPerPx === 'number' ? d.mmPerPx : null,
    panelWidthMm: typeof d.panelWidthMm === 'number' ? d.panelWidthMm : FALLBACK_PANEL_WIDTH_MM,
    panelHeightMm: typeof d.panelHeightMm === 'number' ? d.panelHeightMm : FALLBACK_PANEL_HEIGHT_MM,
    panelGapMm: typeof d.panelGapMm === 'number' ? d.panelGapMm : DEFAULT_PANEL_GAP_MM,
    panels: Array.isArray(d.panels)
      ? d.panels.map((p) => ({
          ...p,
          rotation: p.rotation === 90 ? 90 : 0,
          angle: typeof p.angle === 'number' ? p.angle : 0,
          // Bevar additive felt-bindinger (fieldId/cell) hvis til stede.
          ...(typeof p.fieldId === 'string' ? { fieldId: p.fieldId } : {}),
          ...(p.cell && typeof p.cell.r === 'number' && typeof p.cell.c === 'number'
            ? { cell: { r: p.cell.r, c: p.cell.c } }
            : {}),
        }))
      : [],
    fields,
  }
}
