/**
 * Kalkulation → tilbudslinjer (ren logik; bruges af importCalculationToOffer). Bevidst IKKE 'use server'.
 *
 * 00219 (Henrik 2026-10-10/14): eksplicit tilbudstilstand pr. række —
 *   visible          → egen tilbudslinje
 *   hidden_included  → ingen egen linje, men med i prisen: samles i ÉN linje "Øvrige materialer og ydelser"
 *                      (pris = rækkernes total, kost = deres kost) — ingen stille bortfald af pris eller kost
 *   excluded         → hverken linje eller pris
 * Kalkulationens avance og rabat lægges på som eksplicitte linjer (kalkule-review 2026-10-08 #2), beregnet af det
 * importerede grundlag (= kalkulationens subtotal uden udeladte rækker).
 */
import { rowOfferMode } from '@/types/calculations.types'

export const HIDDEN_INCLUDED_LINE_DESCRIPTION = 'Øvrige materialer og ydelser'

export interface CalcImportRow {
  product_id?: string | null
  section?: string | null
  description: string
  quantity?: number | null
  unit?: string | null
  hours?: number | null
  hourly_rate?: number | null
  sale_price?: number | null
  cost_price?: number | null
  discount_percentage?: number | null
  total?: number | null
  show_on_offer?: boolean | null
  offer_mode?: string | null
}

export interface CalcImportLine {
  offer_id: string
  line_type: string
  product_id: string | null
  calculation_id: string
  section: string | null
  position: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  sale_price: number
  cost_price: number | null
  discount_percentage: number
  total: number
}

export function buildCalculationImportLines(input: {
  rows: CalcImportRow[]
  offerId: string
  calculationId: string
  startPosition: number
  marginPercentage: number | null | undefined
  discountPercentage: number | null | undefined
  includeHiddenRows?: boolean
  includeCostPrices?: boolean
  groupBySection?: boolean
}): CalcImportLine[] {
  const includeHidden = input.includeHiddenRows ?? false
  const withCost = input.includeCostPrices ?? true
  let visible = input.rows.filter((r) => rowOfferMode(r) === 'visible' || (includeHidden && rowOfferMode(r) === 'hidden_included'))
  const hiddenIncluded = includeHidden ? [] : input.rows.filter((r) => rowOfferMode(r) === 'hidden_included')
  if (visible.length === 0 && hiddenIncluded.length === 0) return []

  if (input.groupBySection) {
    visible = [...visible].sort((a, b) => {
      if (!a.section && !b.section) return 0
      if (!a.section) return 1
      if (!b.section) return -1
      return a.section.localeCompare(b.section)
    })
  }

  const lines: CalcImportLine[] = []
  let pos = input.startPosition
  const base = { offer_id: input.offerId, calculation_id: input.calculationId }

  for (const row of visible) {
    const unitPrice = Number(row.hourly_rate || row.sale_price || 0) // timepris for arbejdsrækker
    lines.push({
      ...base,
      line_type: row.product_id ? 'product' : 'calculation',
      product_id: row.product_id ?? null,
      section: row.section ?? null,
      position: pos++,
      description: row.description,
      quantity: Number(row.hours || row.quantity || 0),
      unit: row.hours ? 'timer' : (row.unit || 'stk'),
      unit_price: unitPrice,
      sale_price: unitPrice, // sale_price = unit_price (faktura fra tilbud kræver det — kalkule-review 2026-10-08 #6)
      cost_price: withCost ? (row.cost_price ?? null) : null,
      discount_percentage: Number(row.discount_percentage ?? 0),
      total: Number(row.total ?? 0),
    })
  }

  if (hiddenIncluded.length > 0) {
    const amount = Math.round(hiddenIncluded.reduce((s, r) => s + Number(r.total ?? 0), 0) * 100) / 100
    const cost = Math.round(hiddenIncluded.reduce((s, r) => s + Number(r.cost_price ?? 0) * Number(r.quantity ?? 1), 0) * 100) / 100
    lines.push({
      ...base, line_type: 'calculation', product_id: null, section: null, position: pos++,
      description: HIDDEN_INCLUDED_LINE_DESCRIPTION, quantity: 1, unit: 'stk',
      unit_price: amount, sale_price: amount, cost_price: withCost ? cost : null, discount_percentage: 0, total: amount,
    })
  }

  const subtotal = Math.round(lines.reduce((s, l) => s + Number(l.total || 0), 0) * 100) / 100
  const marginPct = Number(input.marginPercentage ?? 0)
  const discountPct = Number(input.discountPercentage ?? 0)
  const marginAmt = Math.round(subtotal * marginPct) / 100
  const discountAmt = Math.round((subtotal + marginAmt) * discountPct) / 100
  const extra = (description: string, amount: number) => lines.push({
    ...base, line_type: 'calculation', product_id: null, section: null, position: pos++, description,
    quantity: 1, unit: 'stk', unit_price: amount, sale_price: amount, cost_price: withCost ? 0 : null, discount_percentage: 0, total: amount,
  })
  if (marginAmt >= 0.01) extra(`Avance ${marginPct.toLocaleString('da-DK')} % iht. kalkulation`, marginAmt)
  if (discountAmt >= 0.01) extra(`Rabat ${discountPct.toLocaleString('da-DK')} % iht. kalkulation`, -discountAmt)
  return lines
}
