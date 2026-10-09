/**
 * Profit Engine trin 2 (kun visning).
 * Linjefoden regnede DB uden tilbudsrabat. Send-gaten bruger rabatten.
 * Skyggen viser begge og lader motoren regne samme salg med fuld kost.
 * Rabatten sænker salget. Kosten ændres ikke. Manglende kost bliver ikke 0 i motoren.
 */
import { computeOfferDB, type LineItemForDB } from '@/lib/logic/pricing'
import { priceJob } from '@/lib/profit/engine'
import { isLabourUnit } from '@/lib/profit/offer-analysis'

export interface OfferShadowLine extends LineItemForDB {
  description: string
  unit?: string | null
}

export interface OfferEngineShadow {
  db1: number
  db1Pct: number
  sale: number
  directCost: number
  warnings: string[]
}

export interface OfferDbShadow {
  before: ReturnType<typeof computeOfferDB>
  after: ReturnType<typeof computeOfferDB>
  /** null når en salgslinje mangler kost. Motoren må ikke fylde 0 og kalde det enighed. */
  engine: OfferEngineShadow | null
  differs: boolean
}

export function shadowOfferDb(lines: OfferShadowLine[], offerDiscountPct = 0): OfferDbShadow {
  const discount = Number.isFinite(offerDiscountPct) ? Math.min(Math.max(offerDiscountPct, 0), 100) : 0
  const before = computeOfferDB(lines, 0)
  const after = computeOfferDB(lines, discount)
  return {
    before,
    after,
    engine: engineOnStoredPrices(lines, discount),
    differs: discount > 0 && before.dbPercentage !== after.dbPercentage,
  }
}

function engineOnStoredPrices(lines: OfferShadowLine[], discount: number): OfferEngineShadow | null {
  const missing = lines.some((l) => l.total > 0 && !(l.cost_price || l.supplier_cost_price_at_creation))
  if (missing || lines.length === 0) return null

  const jobLines: Parameters<typeof priceJob>[0]['lines'] = []
  for (const line of lines) {
    const qty = Number(line.quantity) || 0
    if (qty <= 0) continue
    const unitCost = Number(line.cost_price || line.supplier_cost_price_at_creation || 0)
    const unitSale = (Number(line.total) || 0) / qty
    if (isLabourUnit(line.unit)) {
      jobLines.push({
        kind: 'labour',
        description: line.description,
        hours: qty,
        costPerHour: unitCost,
        salePerHour: unitSale,
      })
      continue
    }
    if (!(unitCost > 0)) return null
    jobLines.push({
      kind: 'material',
      description: line.description,
      quantity: qty,
      unitListCost: unitCost,
      policy: { mode: 'markup', markupPct: (unitSale / unitCost - 1) * 100 },
    })
  }
  if (jobLines.length === 0) return null

  const result = priceJob({ lines: jobLines, customerDiscountPct: discount })
  return {
    db1: result.db1,
    db1Pct: result.db1Pct,
    sale: result.sale,
    directCost: result.directCost,
    warnings: result.warnings,
  }
}
