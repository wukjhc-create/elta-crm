/**
 * Profit Engine i brug (P3 #18 → feature): LØNSOMHEDSANALYSE af et eksisterende tilbud. Ren og deterministisk.
 *
 * Problem (prod 2026-10-01): 7 af 14 tilbudslinjer har ingen kostpris. Den eksisterende DB-visning (computeOfferDB)
 * regner manglende kost som 0 kr → DB vises for HØJT, og især timelinjer (arbejdsløn) bliver "gratis".
 *
 * Analysen:
 *   - klassificerer linjer: timer (enhed t/time/timer) vs. materialer/øvrigt
 *   - kostkilde pr. linje: 'kendt' (cost_price/leverandørkost) · 'estimeret' (timer × firmaets timekost) · 'ukendt'
 *   - DB efter tilbudsrabat på to måder: kun KENDT kost (som i dag) og REALISTISK (inkl. estimeret timekost)
 *   - kostdækning (% af salg med kendt/estimeret kost) — lav dækning = DB er usikker
 *   - advarsler på dansk: under minimum-/mål-DB, timepris under timekost, linjer uden kost, rabat der æder DB
 * Ingen I/O. Afrunding til øre.
 */
export type CostSource = 'known' | 'estimated' | 'unknown'

export interface OfferLineInput {
  description: string
  quantity: number
  unit: string | null
  /** Linjens salgstotal (før tilbudsrabat) — som gemt på linjen. */
  total: number
  /** Kostpris pr. enhed (cost_price ?? supplier_cost_price_at_creation); null/0 = ukendt. */
  unitCost: number | null
}

export interface OfferProfitInput {
  lines: OfferLineInput[]
  offerDiscountPct?: number
  /** Firmaets timekost (fuldt belastet) — null hvis ikke konfigureret. */
  hourlyCost: number | null
  minimumDbPct?: number | null
  targetDbPct?: number | null
}

export interface LineAnalysis {
  description: string
  isLabour: boolean
  sale: number
  cost: number | null
  costSource: CostSource
  dbPct: number | null
}

export interface OfferProfitAnalysis {
  lines: LineAnalysis[]
  saleBeforeDiscount: number
  discount: number
  sale: number
  knownCost: number
  estimatedLabourCost: number
  /** DB hvis kun kendt kost tælles (svarer til den eksisterende visning) */
  dbKnownPct: number
  /** DB inkl. estimeret timekost — det mest realistiske tal */
  dbRealisticPct: number
  dbRealistic: number
  /** Andel af salget (før rabat) der har kendt eller estimeret kost */
  costCoveragePct: number
  unknownCostLines: number
  warnings: string[]
  /** 'ok' | 'usikker' (lav dækning) | 'under_minimum' | 'under_maal' */
  verdict: 'ok' | 'usikker' | 'under_minimum' | 'under_maal'
}

const LABOUR_UNIT = /^(t|tim|time|timer|hour|hours|h)\.?$/i
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
const pct = (part: number, whole: number) => (whole > 0 ? r2((part / whole) * 100) : 0)

export function isLabourUnit(unit: string | null | undefined): boolean {
  return !!unit && LABOUR_UNIT.test(unit.trim())
}

export function analyzeOfferProfit(input: OfferProfitInput): OfferProfitAnalysis {
  const discountPct = Math.min(Math.max(Number(input.offerDiscountPct ?? 0), 0), 100)
  const hourly = input.hourlyCost != null && input.hourlyCost > 0 ? input.hourlyCost : null
  const warnings: string[] = []

  const lines: LineAnalysis[] = input.lines.map((l) => {
    const isLabour = isLabourUnit(l.unit)
    const qty = Number(l.quantity) || 0
    const sale = r2(Number(l.total) || 0)
    let cost: number | null = null
    let costSource: CostSource = 'unknown'
    if (l.unitCost != null && l.unitCost > 0) { cost = r2(l.unitCost * qty); costSource = 'known' }
    else if (isLabour && hourly) { cost = r2(hourly * qty); costSource = 'estimated' }
    return { description: l.description, isLabour, sale, cost, costSource, dbPct: cost != null && sale > 0 ? pct(sale - cost, sale) : null }
  })

  const saleBeforeDiscount = r2(lines.reduce((s, l) => s + l.sale, 0))
  const discount = r2(saleBeforeDiscount * (discountPct / 100))
  const sale = r2(saleBeforeDiscount - discount)
  const knownCost = r2(lines.filter((l) => l.costSource === 'known').reduce((s, l) => s + (l.cost ?? 0), 0))
  const estimatedLabourCost = r2(lines.filter((l) => l.costSource === 'estimated').reduce((s, l) => s + (l.cost ?? 0), 0))
  const realisticCost = r2(knownCost + estimatedLabourCost)
  const coveredSale = lines.filter((l) => l.costSource !== 'unknown').reduce((s, l) => s + l.sale, 0)
  const costCoveragePct = pct(coveredSale, saleBeforeDiscount)
  const unknownCostLines = lines.filter((l) => l.costSource === 'unknown' && l.sale > 0).length
  const dbKnownPct = pct(sale - knownCost, sale)
  const dbRealistic = r2(sale - realisticCost)
  const dbRealisticPct = pct(dbRealistic, sale)

  // Advarsler (rækkefølge = vigtighed)
  const min = input.minimumDbPct ?? null
  const target = input.targetDbPct ?? null
  if (sale <= 0) warnings.push('Tilbuddet har ingen salgssum.')
  if (dbRealistic < 0) warnings.push(`Tilbuddet giver underskud: ${dbRealistic.toLocaleString('da-DK')} kr (realistisk DB ${dbRealisticPct} %).`)
  else if (min != null && sale > 0 && dbRealisticPct < min) warnings.push(`Realistisk DB ${dbRealisticPct} % er under minimum ${min} %.`)
  else if (target != null && sale > 0 && dbRealisticPct < target) warnings.push(`Realistisk DB ${dbRealisticPct} % er under mål-DB ${target} %.`)
  if (estimatedLabourCost > 0 && r2(dbKnownPct - dbRealisticPct) >= 1)
    warnings.push(`Timelinjer uden kostpris: DB falder fra ${dbKnownPct} % til ${dbRealisticPct} %, når firmaets timekost (${hourly} kr/t) medregnes.`)
  const labourUnderCost = lines.filter((l) => l.isLabour && l.cost != null && l.sale < l.cost)
  if (labourUnderCost.length) warnings.push(`${labourUnderCost.length} timelinje(r) sælges under timekost.`)
  if (unknownCostLines) warnings.push(`${unknownCostLines} linje(r) mangler kostpris — DB er for højt angivet med deres fulde salg (${pct(saleBeforeDiscount - coveredSale, saleBeforeDiscount)} % af salget).`)
  if (lines.some((l) => l.isLabour && l.costSource === 'unknown') && !hourly)
    warnings.push('Firmaets timekost er ikke sat (Indstillinger → Timeøkonomi) — timelinjer kan ikke kostberegnes.')
  if (discountPct > 0 && r2(pct(saleBeforeDiscount - realisticCost, saleBeforeDiscount) - dbRealisticPct) >= 5)
    warnings.push(`Tilbudsrabatten på ${discountPct} % sænker DB med ${r2(pct(saleBeforeDiscount - realisticCost, saleBeforeDiscount) - dbRealisticPct)} procentpoint.`)

  const verdict: OfferProfitAnalysis['verdict'] =
    min != null && sale > 0 && dbRealisticPct < min ? 'under_minimum'
      : costCoveragePct < 80 ? 'usikker'
        : target != null && sale > 0 && dbRealisticPct < target ? 'under_maal'
          : 'ok'

  return { lines, saleBeforeDiscount, discount, sale, knownCost, estimatedLabourCost, dbKnownPct, dbRealisticPct, dbRealistic,
    costCoveragePct, unknownCostLines, warnings, verdict }
}
