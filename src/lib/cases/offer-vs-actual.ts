/**
 * N26c — efterkalkulation på linjeniveau: tilbudt vs. faktisk (ren logik, ingen I/O).
 *
 * Tilbudslinjer matches mod sagens faktiske materialer i prioriteret rækkefølge:
 *   1. case_materials.source_offer_line_id = tilbudslinjens id (eksplicit kobling)
 *   2. samme leverandørprodukt (supplier_product_id)
 *   3. samme normaliserede beskrivelse
 * Et faktisk materiale bruges højst én gang. Timelinjer (enhed t/time/timer) samles i én "Arbejdstimer"-række mod
 * sagens registrerede timer og AGGREGEREDE timekost (D50 — aldrig kost pr. medarbejder). Faktiske materialer uden
 * tilbudslinje vises som "ikke tilbudt".
 */
import { isLabourUnit } from '@/lib/profit/offer-analysis'

export interface OfferLineInput {
  id: string
  description: string
  quantity: number | string | null
  unit: string | null
  cost_price: number | string | null
  supplier_cost_price_at_creation?: number | string | null
  supplier_product_id?: string | null
}

export interface ActualMaterialInput {
  id: string
  description: string
  quantity: number | string | null
  unit: string | null
  total_cost: number | string | null
  supplier_product_id?: string | null
  source_offer_line_id?: string | null
}

export interface ActualLabourInput {
  hours: number
  /** aggregeret intern timekost for sagen (null = ukendt) */
  cost: number | null
}

export type OfferVsActualStatus = 'as_offered' | 'over' | 'under' | 'not_used' | 'not_offered'

export interface OfferVsActualRow {
  key: string
  kind: 'labour' | 'material'
  description: string
  unit: string | null
  offered_qty: number | null
  actual_qty: number | null
  offered_cost: number | null
  actual_cost: number | null
  /** faktisk − tilbudt kost (positiv = dyrere end tilbudt); null når en af siderne mangler */
  cost_deviation: number | null
  status: OfferVsActualStatus
  match: 'offer_line' | 'supplier_product' | 'description' | null
}

export interface OfferVsActualResult {
  rows: OfferVsActualRow[]
  totals: { offered_cost: number; actual_cost: number; deviation: number }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
/** Tolerance: ±2 % eller 1 kr regnes som "som tilbudt" (afrunding, småpriser). */
const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.02)

function statusFor(offeredQty: number, actualQty: number, offeredCost: number | null, actualCost: number | null): OfferVsActualStatus {
  if (offeredCost != null && actualCost != null && offeredCost > 0) {
    return sameAmount(offeredCost, actualCost) ? 'as_offered' : actualCost > offeredCost ? 'over' : 'under'
  }
  return Math.abs(actualQty - offeredQty) < 0.005 ? 'as_offered' : actualQty > offeredQty ? 'over' : 'under'
}

export function compareOfferToActual(offerLines: OfferLineInput[], materials: ActualMaterialInput[], labour: ActualLabourInput): OfferVsActualResult {
  const rows: OfferVsActualRow[] = []
  const used = new Set<string>()

  // Arbejdstimer — samlet række (kost pr. medarbejder vises aldrig)
  const labourLines = offerLines.filter((l) => isLabourUnit(l.unit))
  if (labourLines.length > 0 || labour.hours > 0) {
    const offeredQty = r2(labourLines.reduce((s, l) => s + num(l.quantity), 0))
    const known = labourLines.filter((l) => num(l.cost_price) > 0)
    const offeredCost = known.length ? r2(known.reduce((s, l) => s + num(l.quantity) * num(l.cost_price), 0)) : null
    const actualCost = labour.cost != null ? r2(labour.cost) : null
    rows.push({
      key: 'labour', kind: 'labour', description: 'Arbejdstimer', unit: 'timer',
      offered_qty: labourLines.length ? offeredQty : null, actual_qty: r2(labour.hours),
      offered_cost: offeredCost, actual_cost: actualCost,
      cost_deviation: offeredCost != null && actualCost != null ? r2(actualCost - offeredCost) : null,
      status: labourLines.length === 0 ? 'not_offered' : labour.hours <= 0 ? 'not_used' : statusFor(offeredQty, labour.hours, offeredCost, actualCost),
      match: null,
    })
  }

  for (const line of offerLines) {
    if (isLabourUnit(line.unit)) continue
    const unitCost = num(line.cost_price) || num(line.supplier_cost_price_at_creation)
    const offeredQty = r2(num(line.quantity))
    const offeredCost = unitCost > 0 ? r2(offeredQty * unitCost) : null
    const free = materials.filter((m) => !used.has(m.id))
    let match: OfferVsActualRow['match'] = null
    let hits = free.filter((m) => m.source_offer_line_id === line.id)
    if (hits.length) match = 'offer_line'
    else if (line.supplier_product_id) {
      hits = free.filter((m) => m.supplier_product_id && m.supplier_product_id === line.supplier_product_id && !m.source_offer_line_id)
      if (hits.length) match = 'supplier_product'
    }
    if (!hits.length) {
      hits = free.filter((m) => !m.source_offer_line_id && norm(m.description) === norm(line.description))
      if (hits.length) match = 'description'
    }
    for (const h of hits) used.add(h.id)
    const actualQty = hits.length ? r2(hits.reduce((s, m) => s + num(m.quantity), 0)) : 0
    const actualCost = hits.length ? r2(hits.reduce((s, m) => s + num(m.total_cost), 0)) : null
    rows.push({
      key: line.id, kind: 'material', description: line.description, unit: line.unit,
      offered_qty: offeredQty, actual_qty: hits.length ? actualQty : null,
      offered_cost: offeredCost, actual_cost: actualCost,
      cost_deviation: offeredCost != null && actualCost != null ? r2(actualCost - offeredCost) : actualCost == null && offeredCost != null ? r2(-offeredCost) : null,
      status: hits.length ? statusFor(offeredQty, actualQty, offeredCost, actualCost) : 'not_used',
      match,
    })
  }

  for (const m of materials) {
    if (used.has(m.id)) continue
    const actualCost = r2(num(m.total_cost))
    rows.push({
      key: m.id, kind: 'material', description: m.description, unit: m.unit,
      offered_qty: null, actual_qty: r2(num(m.quantity)), offered_cost: null, actual_cost: actualCost,
      cost_deviation: actualCost, status: 'not_offered', match: null,
    })
  }

  const offered = r2(rows.reduce((s, r) => s + (r.offered_cost ?? 0), 0))
  const actual = r2(rows.reduce((s, r) => s + (r.actual_cost ?? 0), 0))
  return { rows, totals: { offered_cost: offered, actual_cost: actual, deviation: r2(actual - offered) } }
}
