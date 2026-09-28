/**
 * Profit Engine (P3 #18) — REN, deterministisk prismotor: materiale + timer + overhead + DB -> salgspris.
 * Ingen DB, ingen netvaerk. Beloeb i kr ekskl. moms; afrunding kun paa det endelige kr-beloeb (2 decimaler).
 *
 * Kernen adskiller de to sider, som dagens fire algoritmer blander sammen (docs/profit/PROFIT_ENGINE_DESIGN.md):
 *   INDKOEB  listepris -> grossistrabat -> NETTO-KOSTPRIS (vores reelle omkostning)
 *   SALG     kostpris -> prispolitik (avance ELLER maal-DB) -> listesalgspris -> KUNDERABAT -> salgspris
 *   DB       beregnes ALTID paa den reelle nettokostpris. Kunderabat saenker salgsprisen og dermed DB —
 *            den maa aldrig traekkes fra kostprisen (det overvurderer DB, se legacyDiscountOnCost i tests).
 *
 * Begreber (eksplicit, fordi koden i dag bruger "margin" om begge):
 *   avance (markup) = (salg - kost) / kost      DB% (daekningsgrad) = (salg - kost) / salg
 *   avance -> DB: m / (1 + m)                   DB -> avance: d / (1 - d)
 */

export type ComponentKind = 'material' | 'labour' | 'subcontractor' | 'equipment' | 'other'

/** Salgsprispolitik for en komponent: avance paa kost ELLER maal-DB paa salg. */
export type PricePolicy = { mode: 'markup'; markupPct: number } | { mode: 'target_db'; dbPct: number }

export interface MaterialLine {
  kind: 'material' | 'subcontractor' | 'equipment' | 'other'
  description: string
  quantity: number
  /** Grossistens listepris pr. enhed (eller direkte nettopris hvis supplierDiscountPct udelades). */
  unitListCost: number
  /** Indkoebsrabat fra grossistaftalen (saenker VORES kost). */
  supplierDiscountPct?: number
  policy: PricePolicy
}

export interface LabourLine {
  kind: 'labour'
  description: string
  hours: number
  /** Reel timeomkostning (loen + sociale omk.), fx fra employee_compensation. */
  costPerHour: number
  /** Timepris til kunden. */
  salePerHour: number
}

export interface JobInput {
  lines: Array<MaterialLine | LabourLine>
  /** Risikobuffer paa estimerede timer (%), fx 10 = 10 % flere timer i baade kost og salg. */
  labourRiskPct?: number
  /** Indirekte omkostninger (kørsel, værktøj, småmaterialer) som % af direkte kost — paavirker DB2, ikke salgspris. */
  overheadPctOfDirectCost?: number
  /** Kunderabat paa hele salget (%). Saenker salgsprisen; kost uaendret. */
  customerDiscountPct?: number
  /** Minimum-DB% for advarsel (fx calculation_settings.minimum_db). */
  minimumDbPct?: number
}

export interface LineResult {
  description: string
  kind: ComponentKind
  cost: number
  saleBeforeDiscount: number
}

export interface JobResult {
  lines: LineResult[]
  directCost: number
  saleBeforeDiscount: number
  customerDiscount: number
  sale: number
  db1: number
  db1Pct: number
  overhead: number
  db2: number
  db2Pct: number
  warnings: string[]
}

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0)

export function markupToDb(markupPct: number): number {
  return round2((markupPct / (100 + markupPct)) * 100)
}
export function dbToMarkup(dbPct: number): number {
  if (dbPct >= 100) throw new Error('DB% skal være under 100')
  return round2((dbPct / (100 - dbPct)) * 100)
}

/** Salgspris for én enhed ud fra reel nettokost og politik. */
export function unitSalePrice(netUnitCost: number, policy: PricePolicy): number {
  if (policy.mode === 'markup') return netUnitCost * (1 + policy.markupPct / 100)
  if (policy.dbPct >= 100) throw new Error('mål-DB skal være under 100 %')
  return netUnitCost / (1 - policy.dbPct / 100)
}

export function priceJob(input: JobInput): JobResult {
  const warnings: string[] = []
  const riskFactor = 1 + (input.labourRiskPct ?? 0) / 100
  const lines: LineResult[] = input.lines.map((l) => {
    if (l.kind === 'labour') {
      const hours = l.hours * riskFactor
      if (l.salePerHour < l.costPerHour) warnings.push(`${l.description}: timepris (${l.salePerHour}) er under timeomkostning (${l.costPerHour})`)
      return { description: l.description, kind: 'labour', cost: hours * l.costPerHour, saleBeforeDiscount: hours * l.salePerHour }
    }
    const net = l.unitListCost * (1 - (l.supplierDiscountPct ?? 0) / 100)
    if (!(l.unitListCost > 0)) warnings.push(`${l.description}: mangler kostpris`)
    return { description: l.description, kind: l.kind, cost: net * l.quantity, saleBeforeDiscount: unitSalePrice(net, l.policy) * l.quantity }
  })

  const directCost = round2(lines.reduce((s, l) => s + l.cost, 0))
  const saleBeforeDiscount = round2(lines.reduce((s, l) => s + l.saleBeforeDiscount, 0))
  const customerDiscount = round2(saleBeforeDiscount * (input.customerDiscountPct ?? 0) / 100)
  const sale = round2(saleBeforeDiscount - customerDiscount)
  const db1 = round2(sale - directCost)
  const overhead = round2(directCost * (input.overheadPctOfDirectCost ?? 0) / 100)
  const db2 = round2(db1 - overhead)
  const result: JobResult = {
    lines: lines.map((l) => ({ ...l, cost: round2(l.cost), saleBeforeDiscount: round2(l.saleBeforeDiscount) })),
    directCost, saleBeforeDiscount, customerDiscount, sale, db1, db1Pct: pct(db1, sale), overhead, db2, db2Pct: pct(db2, sale), warnings,
  }
  if (input.minimumDbPct != null && result.db1Pct < input.minimumDbPct) warnings.push(`DB ${result.db1Pct}% er under minimum ${input.minimumDbPct}%`)
  if (db1 < 0) warnings.push('Opgaven giver underskud (negativ DB)')
  return result
}

/**
 * Dagens adfaerd (pricing.ts calculateSalePrice(customerDiscount), price-engine.ts calculatePrice, DB-funktionen
 * get_customer_product_price): kunderabat traekkes fra KOSTPRISEN foer avance. Bruges KUN i tests/rapport til at
 * kvantificere afvigelsen — ikke til prissaetning.
 */
export function legacyDiscountOnCost(unitCost: number, markupPct: number, customerDiscountPct: number): { sale: number; reportedDbPct: number; trueDbPct: number } {
  const effectiveCost = unitCost * (1 - customerDiscountPct / 100)
  const sale = effectiveCost * (1 + markupPct / 100)
  return { sale: round2(sale), reportedDbPct: pct(sale - effectiveCost, sale), trueDbPct: pct(sale - unitCost, sale) }
}
