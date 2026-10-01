/**
 * Grossist-prissammenligning (KlarPris-foundation). Ren og deterministisk.
 * Prod 2026-10-01: 564 EAN findes hos både AO og LM; 460 af dem har > 5 % prisforskel (gns. spænd 16,7 %).
 *
 * EAN normaliseres (kun cifre, uden foranstillede nuller — EAN-13 og GTIN-14 matcher). Kun produkter med kostpris > 0.
 */
export interface SupplierProductRef {
  id: string
  supplierId: string
  supplierName: string
  sku: string
  name: string
  ean: string | null
  costPrice: number | null
}

export interface OfferLineRef {
  lineId: string
  description: string
  quantity: number
  supplierProductId: string
  /** Kost brugt på linjen (supplier_cost_price_at_creation eller cost_price) */
  unitCost: number | null
}

export interface CheaperAlternative {
  lineId: string
  description: string
  ean: string
  current: { supplierName: string; unitCost: number }
  best: { productId: string; supplierName: string; sku: string; unitCost: number }
  savingPerUnit: number
  savingTotal: number
  savingPct: number
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function normalizeEan(ean: string | null | undefined): string | null {
  if (!ean) return null
  const d = String(ean).replace(/\D/g, '').replace(/^0+/, '')
  return d.length >= 7 ? d : null
}

/** Billigere leverandør pr. tilbudslinje (kun hvor besparelsen er >= minSavingPct). Sorteret efter størst besparelse. */
export function findCheaperAlternatives(lines: OfferLineRef[], products: SupplierProductRef[], minSavingPct = 1): CheaperAlternative[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const byEan = new Map<string, SupplierProductRef[]>()
  for (const p of products) {
    const e = normalizeEan(p.ean)
    if (!e || !p.costPrice || p.costPrice <= 0) continue
    const arr = byEan.get(e) ?? []
    arr.push(p)
    byEan.set(e, arr)
  }
  const out: CheaperAlternative[] = []
  for (const l of lines) {
    const own = byId.get(l.supplierProductId)
    const e = normalizeEan(own?.ean)
    if (!own || !e) continue
    const current = l.unitCost && l.unitCost > 0 ? l.unitCost : own.costPrice ?? 0
    if (current <= 0) continue
    const alts = (byEan.get(e) ?? []).filter((p) => p.supplierId !== own.supplierId)
    if (!alts.length) continue
    const best = alts.reduce((a, b) => ((b.costPrice ?? Infinity) < (a.costPrice ?? Infinity) ? b : a))
    const bestCost = best.costPrice ?? 0
    if (bestCost <= 0 || bestCost >= current) continue
    const savingPct = r2(((current - bestCost) / current) * 100)
    if (savingPct < minSavingPct) continue
    const perUnit = r2(current - bestCost)
    out.push({ lineId: l.lineId, description: l.description, ean: e,
      current: { supplierName: own.supplierName, unitCost: r2(current) },
      best: { productId: best.id, supplierName: best.supplierName, sku: best.sku, unitCost: r2(bestCost) },
      savingPerUnit: perUnit, savingTotal: r2(perUnit * (Number(l.quantity) || 0)), savingPct })
  }
  return out.sort((a, b) => b.savingTotal - a.savingTotal || a.lineId.localeCompare(b.lineId))
}
