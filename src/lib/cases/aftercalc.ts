/**
 * Efterkalkulation V1 — ren beregning for én sag. Ingen I/O.
 *
 * Spørgsmålet er: hvad troede vi sagen ville tjene, og hvad tjente vi?
 * Beløb er ekskl. moms. Summer i øre. Manglende kost bliver null — aldrig 0.
 * Reglerne er de samme som Økonomi-fanen og summarizeCaseInvoices (se docs/design/profit-engine-v1.md).
 */
import { compareOfferToActual, type OfferVsActualRow, type OfferVsActualStatus } from '@/lib/cases/offer-vs-actual'
import { isLabourUnit } from '@/lib/profit/offer-analysis'
import { summarizeCaseInvoices, type CaseInvoiceRow } from '@/lib/invoices/net-invoiced'

export interface AftercalcOfferLine {
  id: string
  description: string
  quantity: number | string | null
  unit: string | null
  /** Linjesalg ekskl. moms, før tilbudsrabat. */
  total: number | string | null
  cost_price: number | string | null
  supplier_cost_price_at_creation?: number | string | null
  supplier_product_id?: string | null
  line_type?: string | null
}

export interface AftercalcMaterial {
  id: string
  description: string
  quantity: number | string | null
  unit: string | null
  total_cost: number | string | null
  unit_cost?: number | string | null
  supplier_product_id?: string | null
  source_offer_line_id?: string | null
  billable?: boolean | null
  invoice_line_id?: string | null
}

export interface AftercalcOther {
  id: string
  description: string
  quantity?: number | string | null
  total_cost: number | string | null
  unit_cost?: number | string | null
  billable?: boolean | null
  invoice_line_id?: string | null
}

export interface AftercalcTimeLog {
  hours: number | string | null
  cost_amount: number | string | null
  billable: boolean | null
  end_time: string | null
  approval_status: string | null
  invoice_line_id?: string | null
}

export interface AftercalcInvoice {
  total_amount: number | string | null
  final_amount?: number | string | null
  amount_paid?: number | string | null
  status: string | null
  invoice_type: string | null
  voided_at: string | null
  offer_id?: string | null
}

export interface AftercalcWorkOrder {
  id: string
  status: string | null
}

export interface AftercalcOffer {
  id: string
  offer_number: string | null
  /** Linjesum ekskl. moms, før tilbuds-rabat. Ikke final_amount. */
  total_amount: number | string | null
  discount_percentage?: number | string | null
  discount_amount?: number | string | null
}

export interface AftercalcInput {
  offer: AftercalcOffer | null
  offerLines: AftercalcOfferLine[]
  materials: AftercalcMaterial[]
  otherCosts: AftercalcOther[]
  timeLogs: AftercalcTimeLog[]
  invoices: AftercalcInvoice[]
  workOrders: AftercalcWorkOrder[]
}

export interface AftercalcSide {
  revenue: number | null
  material_cost: number | null
  labour_hours: number | null
  labour_cost: number | null
  other_cost: number | null
  total_cost: number | null
  contribution_margin: number | null
  /** null når omsætningen er ≤ 0 eller kosten er ukendt */
  contribution_margin_pct: number | null
  cost_complete: boolean
}

export interface VarianceAmount {
  /** faktisk − tilbudt */
  amount: number | null
  /** procent af |tilbudt|; null når tilbudt er 0 eller ukendt */
  pct: number | null
}

export interface AftercalcVariance {
  revenue: VarianceAmount
  material_cost: VarianceAmount
  labour_hours: VarianceAmount
  labour_cost: VarianceAmount
  other_cost: VarianceAmount
  total_cost: VarianceAmount
  contribution_margin: VarianceAmount
  /** faktisk DB% − tilbudt DB%, i procentpoint */
  contribution_margin_pct_points: number | null
}

export type DataQualityCode =
  | 'missing_offer'
  | 'missing_cost_price'
  | 'missing_frozen_labour_cost'
  | 'offer_without_cost_basis'
  | 'unlinked_materials'
  | 'unmatched_lines'
  | 'unbilled_work'
  | 'credit_notes'
  | 'rejected_hours'
  | 'open_work'
  | 'open_timers'
  | 'invoice_without_offer'
  | 'non_billable_hours'
  | 'draft_invoices_ignored'
  | 'partial_invoice'
  | 'final_invoice'
  | 'header_line_mismatch'

export interface DataQualityWarning {
  code: DataQualityCode
  severity: 'warning' | 'info'
  message: string
  count?: number
}

export type AftercalcLineStatus = OfferVsActualStatus | 'missing_cost' | 'unmatched'

export interface AftercalcLine {
  key: string
  kind: 'labour' | 'material'
  description: string
  unit: string | null
  offered_qty: number | null
  actual_qty: number | null
  offered_cost: number | null
  actual_cost: number | null
  cost_deviation: number | null
  status: AftercalcLineStatus
  match: OfferVsActualRow['match']
}

export interface AftercalcHighlight {
  key: string
  description: string
  amount: number
  status: AftercalcLineStatus
}

export interface CaseAftercalc {
  quoted: AftercalcSide
  actual: AftercalcSide
  variance: AftercalcVariance
  lines: AftercalcLine[]
  /** Dyreste merforbrug først (faktisk kost over tilbudt). */
  worst: AftercalcHighlight[]
  /** Største besparelse først. */
  best: AftercalcHighlight[]
  unused_offer_lines: AftercalcHighlight[]
  extra_not_offered: AftercalcHighlight[]
  missing_cost_lines: AftercalcHighlight[]
  warnings: DataQualityWarning[]
  /** warning når mindst én advarsel kan gøre DB misvisende */
  data_quality: 'ok' | 'warning'
  offer: { id: string; offer_number: string | null } | null
  invoiced_state: 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced'
}

export interface CaseAftercalcView extends CaseAftercalc {
  case_number: string | null
  title: string | null
}

export const DATA_QUALITY_LABELS: Record<DataQualityCode, string> = {
  missing_offer: 'Intet tilbud',
  missing_cost_price: 'Manglende kostpris',
  missing_frozen_labour_cost: 'Manglende frossen lønkost',
  offer_without_cost_basis: 'Tilbud uden kostgrundlag',
  unlinked_materials: 'Ukoblet materiale',
  unmatched_lines: 'Ikke matchet',
  unbilled_work: 'Ikke faktureret',
  credit_notes: 'Kreditnota',
  rejected_hours: 'Afviste timer',
  open_work: 'Åben arbejdsordre',
  open_timers: 'Åben timer',
  invoice_without_offer: 'Faktura uden tilbud',
  non_billable_hours: 'Ikke-fakturerbare timer',
  draft_invoices_ignored: 'Kladde tæller ikke',
  partial_invoice: 'Delvist faktureret',
  final_invoice: 'Slutfaktura',
  header_line_mismatch: 'Tilbudstotal afviger fra linjerne',
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function finite(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Kr → øre. null bliver ikke til 0.
 * Læser de to første decimaler fra tallet som tekst, så 0,1 + 0,2 og 336,63
 * ikke lander en øre ved siden af på grund af binær flydende komma.
 */
export function toOre(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const neg = s.startsWith('-')
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.')
  const frac2 = (frac + '00').slice(0, 2)
  const third = frac[2] ?? '0'
  let ore = Number(whole) * 100 + Number(frac2)
  if (third >= '5') ore += 1
  if (!Number.isSafeInteger(ore)) return null
  return neg ? -ore : ore
}

export function fromOre(ore: number): number {
  return ore / 100
}

function qty(v: number | string | null | undefined): number {
  return finite(v) ?? 0
}

function hoursCenti(v: number | string | null | undefined): number {
  return toOre(v) ?? 0
}

function fromCenti(centi: number): number {
  return centi / 100
}

/** Kendt tilbudt enhedskost. 0 og null er "ikke udfyldt", ikke en gratis vare. */
function quotedUnitOre(line: AftercalcOfferLine): number | null {
  const primary = toOre(line.cost_price)
  if (primary != null && primary !== 0) return primary
  const frozen = toOre(line.supplier_cost_price_at_creation)
  if (frozen != null && frozen !== 0) return frozen
  return null
}

function lineCostOre(unitOre: number, quantity: number): number {
  const qCenti = toOre(quantity) ?? 0
  return Math.round((unitOre * qCenti) / 100)
}

function isSection(line: AftercalcOfferLine): boolean {
  return line.line_type === 'section'
}

function pctOf(partOre: number, wholeOre: number): number | null {
  if (wholeOre === 0) return null
  return Math.round((partOre / Math.abs(wholeOre)) * 10000) / 100
}

function dbPct(marginOre: number, revenueOre: number): number | null {
  if (revenueOre <= 0) return null
  return Math.round((marginOre / revenueOre) * 10000) / 100
}

function side(
  revenue: number | null,
  material: number | null,
  hours: number | null,
  labour: number | null,
  other: number | null,
): AftercalcSide {
  const costComplete = material != null && labour != null && other != null
  const total = costComplete ? fromOre(toOre(material)! + toOre(labour)! + toOre(other)!) : null
  const margin = revenue != null && total != null ? fromOre(toOre(revenue)! - toOre(total)!) : null
  return {
    revenue,
    material_cost: material,
    labour_hours: hours,
    labour_cost: labour,
    other_cost: other,
    total_cost: total,
    contribution_margin: margin,
    contribution_margin_pct: margin != null && revenue != null ? dbPct(toOre(margin)!, toOre(revenue)!) : null,
    cost_complete: costComplete,
  }
}

function varianceAmount(actual: number | null, quoted: number | null): VarianceAmount {
  if (actual == null || quoted == null) return { amount: null, pct: null }
  const a = toOre(actual)!
  const q = toOre(quoted)!
  return { amount: fromOre(a - q), pct: pctOf(a - q, q) }
}

function varianceHours(actual: number | null, quoted: number | null): VarianceAmount {
  if (actual == null || quoted == null) return { amount: null, pct: null }
  const a = hoursCenti(actual)
  const q = hoursCenti(quoted)
  const amount = fromCenti(a - q)
  const pct = q === 0 ? null : Math.round(((a - q) / Math.abs(q)) * 10000) / 100
  return { amount, pct }
}

function costMissing(row: { quantity?: number | string | null; unit_cost?: number | string | null }): boolean {
  const q = qty(row.quantity)
  if (q === 0) return false
  const unit = finite(row.unit_cost)
  return unit == null || unit === 0
}

interface Bucket {
  ore: number
  complete: boolean
  missing: number
}

function consumeCost(rows: Array<{ quantity?: number | string | null; unit_cost?: number | string | null; total_cost: number | string | null }>): Bucket {
  let ore = 0
  let missing = 0
  for (const row of rows) {
    if (qty(row.quantity) === 0 && finite(row.total_cost) == null) continue
    if (costMissing(row)) {
      missing += 1
      continue
    }
    const total = toOre(row.total_cost)
    if (total == null) missing += 1
    else ore += total
  }
  return { ore, complete: missing === 0, missing }
}

function quotedRevenueOre(offer: AftercalcOffer, lines: AftercalcOfferLine[]): { ore: number | null; mismatch: boolean } {
  const saleLines = lines.filter((l) => !isSection(l))
  const lineOre = saleLines.reduce((s, l) => s + (toOre(l.total) ?? 0), 0)
  const discountOre = toOre(offer.discount_amount) ?? 0
  // offers.total_amount er linjesummen FØR tilbuds-rabat (update_offer_totals). final_amount er inkl. moms og bruges ikke.
  // Procenten er et tal som 10.00 for 10 %. Den vinder over discount_amount, så rabatten ikke trækkes fra to gange.
  const header = toOre(offer.total_amount)
  const gross = header ?? lineOre
  const pctHundredths = toOre(offer.discount_percentage)
  const net = pctHundredths != null && pctHundredths > 0
    ? Math.round((gross * (10000 - pctHundredths)) / 10000)
    : gross - discountOre
  return { ore: net, mismatch: header != null && Math.abs(header - lineOre) > 100 }
}

export function buildCaseAftercalc(input: AftercalcInput): CaseAftercalc {
  const warnings: DataQualityWarning[] = []
  const offerLines = input.offerLines.filter((l) => !isSection(l))
  const labourLines = offerLines.filter((l) => isLabourUnit(l.unit))
  const materialLines = offerLines.filter((l) => !isLabourUnit(l.unit))

  let quotedRevenue: number | null = null
  let quotedMaterial: number | null = null
  let quotedHours: number | null = null
  let quotedLabour: number | null = null
  let quotedOther: number | null = null

  if (!input.offer) {
    warnings.push({ code: 'missing_offer', severity: 'warning', message: 'Sagen har intet tilbud. Tilbudt omsætning og kost kan ikke beregnes.' })
  } else {
    const revenue = quotedRevenueOre(input.offer, offerLines)
    quotedRevenue = fromOre(revenue.ore ?? 0)
    if (revenue.mismatch) {
      warnings.push({
        code: 'header_line_mismatch',
        severity: 'warning',
        message: 'Tilbuddets total afviger mere end 1 kr fra linjesummen. Omsætningen er totalen minus tilbuds-rabatten.',
      })
    }

    let matOre = 0
    let matMissing = 0
    for (const line of materialLines) {
      const q = qty(line.quantity)
      if (q === 0) continue
      const unit = quotedUnitOre(line)
      if (unit == null) matMissing += 1
      else matOre += lineCostOre(unit, q)
    }
    quotedMaterial = matMissing === 0 ? fromOre(matOre) : null

    let hourCenti = 0
    let labOre = 0
    let labMissing = 0
    for (const line of labourLines) {
      const q = qty(line.quantity)
      if (q === 0) continue
      hourCenti += hoursCenti(q)
      const unit = quotedUnitOre(line)
      if (unit == null) labMissing += 1
      else labOre += lineCostOre(unit, q)
    }
    quotedHours = fromCenti(hourCenti)
    quotedLabour = labMissing === 0 ? fromOre(labOre) : null
    quotedOther = 0

    const priced = offerLines.filter((l) => qty(l.quantity) !== 0 && quotedUnitOre(l) != null).length
    const active = offerLines.filter((l) => qty(l.quantity) !== 0).length
    if (active > 0 && priced === 0) {
      warnings.push({ code: 'offer_without_cost_basis', severity: 'warning', message: 'Tilbuddet har ingen linje med kostpris. Tilbudt DB kan ikke beregnes.' })
    }
    if (matMissing > 0) {
      warnings.push({
        code: 'missing_cost_price',
        severity: 'warning',
        count: matMissing,
        message: `${matMissing} tilbudslinje(r) mangler kostpris. Materialekosten er ukendt — den sættes ikke til 0.`,
      })
    }
    if (labMissing > 0) {
      warnings.push({
        code: 'missing_frozen_labour_cost',
        severity: 'warning',
        count: labMissing,
        message: `${labMissing} tilbudt(e) timelinje(r) mangler frossen kostpris. Lønkosten estimeres ikke.`,
      })
    }
  }

  const includedLogs = input.timeLogs.filter((l) => l.approval_status !== 'rejected' && l.end_time != null)
  const rejected = input.timeLogs.filter((l) => l.approval_status === 'rejected').length
  const openTimers = input.timeLogs.filter((l) => l.approval_status !== 'rejected' && l.end_time == null).length
  let actualHourCenti = 0
  let nonBillCenti = 0
  let actualLabOre = 0
  let labourCostMissing = 0
  let unbilledTime = 0
  for (const log of includedLogs) {
    const h = hoursCenti(log.hours)
    actualHourCenti += h
    if (log.billable === false) nonBillCenti += h
    else if (!log.invoice_line_id) unbilledTime += 1
    const cost = toOre(log.cost_amount)
    if (cost == null) labourCostMissing += 1
    else actualLabOre += cost
  }
  const actualHours = fromCenti(actualHourCenti)
  const actualLabour = labourCostMissing === 0 ? fromOre(actualLabOre) : null

  const matBucket = consumeCost(input.materials.map((m) => ({ quantity: m.quantity, unit_cost: m.unit_cost, total_cost: m.total_cost })))
  const otherBucket = consumeCost(input.otherCosts.map((o) => ({ quantity: o.quantity ?? 1, unit_cost: o.unit_cost, total_cost: o.total_cost })))
  const actualMaterial = matBucket.complete ? fromOre(matBucket.ore) : null
  const actualOther = otherBucket.complete ? fromOre(otherBucket.ore) : null

  if (matBucket.missing > 0) {
    warnings.push({
      code: 'missing_cost_price',
      severity: 'warning',
      count: matBucket.missing,
      message: `${matBucket.missing} registreret materiale mangler kostpris.`,
    })
  }
  if (otherBucket.missing > 0) {
    warnings.push({
      code: 'missing_cost_price',
      severity: 'warning',
      count: otherBucket.missing,
      message: `${otherBucket.missing} øvrig omkostning mangler kostpris.`,
    })
  }
  if (labourCostMissing > 0) {
    warnings.push({
      code: 'missing_frozen_labour_cost',
      severity: 'warning',
      count: labourCostMissing,
      message: `${labourCostMissing} timeregistrering(er) mangler frossen lønkost. Aktuel timesats bruges ikke.`,
    })
  }

  const invSum = summarizeCaseInvoices(input.invoices as CaseInvoiceRow[])
  const actualRevenue = invSum.netExVat
  const issued = input.invoices.filter((i) => i.status === 'sent' || i.status === 'paid')
  const drafts = input.invoices.filter((i) => i.status === 'draft').length
  const credits = issued.filter((i) => i.invoice_type === 'credit').length
  const finals = issued.filter((i) => i.invoice_type === 'final').length
  const unbilledMaterials = input.materials.filter((m) => m.billable !== false && !m.invoice_line_id && qty(m.quantity) !== 0).length
  const unbilledOther = input.otherCosts.filter((o) => o.billable !== false && !o.invoice_line_id && qty(o.quantity ?? 1) !== 0).length
  const unbilled = unbilledTime + unbilledMaterials + unbilledOther

  if (rejected > 0) warnings.push({ code: 'rejected_hours', severity: 'info', count: rejected, message: `${rejected} afviste timeregistrering(er) indgår ikke.` })
  if (openTimers > 0) warnings.push({ code: 'open_timers', severity: 'warning', count: openTimers, message: `${openTimers} åbne timere indgår ikke, før de er stoppet.` })
  if (nonBillCenti > 0) {
    warnings.push({
      code: 'non_billable_hours',
      severity: 'info',
      count: fromCenti(nonBillCenti),
      message: `${fromCenti(nonBillCenti).toLocaleString('da-DK')} ikke-fakturerbare timer indgår i lønkosten, ikke i omsætningen.`,
    })
  }
  const openWork = input.workOrders.filter((w) => w.status === 'planned' || w.status === 'in_progress').length
  if (openWork > 0) warnings.push({ code: 'open_work', severity: 'warning', count: openWork, message: `${openWork} arbejdsordre(r) er ikke afsluttet.` })
  if (drafts > 0) warnings.push({ code: 'draft_invoices_ignored', severity: 'info', count: drafts, message: `${drafts} kladdefaktura(er) tæller ikke som omsætning.` })
  if (credits > 0) warnings.push({ code: 'credit_notes', severity: 'info', count: credits, message: `${credits} kreditnota(er) er trukket fra omsætningen.` })
  if (invSum.issuedCount > 0 && !input.offer) {
    warnings.push({ code: 'invoice_without_offer', severity: 'warning', message: 'Der er faktureret på en sag uden tilbud.' })
  }
  if (unbilled > 0 && invSum.issuedCount > 0) {
    warnings.push({ code: 'partial_invoice', severity: 'warning', count: unbilled, message: `${unbilled} fakturerbare linjer er endnu ikke faktureret.` })
  } else if (unbilled > 0) {
    warnings.push({ code: 'unbilled_work', severity: 'warning', count: unbilled, message: `${unbilled} fakturerbare linjer er ikke faktureret.` })
  }
  if (finals > 0) warnings.push({ code: 'final_invoice', severity: 'info', count: finals, message: 'Sagen har en slutfaktura.' })

  const quoted = side(quotedRevenue, quotedMaterial, quotedHours, quotedLabour, quotedOther)
  const actual = side(actualRevenue, actualMaterial, actualHours, actualLabour, actualOther)

  const cmp = compareOfferToActual(
    offerLines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      cost_price: (() => {
        const unit = quotedUnitOre(l)
        return unit == null ? null : fromOre(unit)
      })(),
      supplier_product_id: l.supplier_product_id,
    })),
    input.materials.map((m) => ({
      id: m.id,
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      total_cost: costMissing(m) ? null : m.total_cost,
      supplier_product_id: m.supplier_product_id,
      source_offer_line_id: m.source_offer_line_id,
    })),
    { hours: actualHours, cost: actualLabour },
    { confidentOnly: true },
  )

  const lines: AftercalcLine[] = cmp.rows.map((r) => ({ ...r, status: r.status as AftercalcLineStatus }))
  const unused = lines.filter((r) => r.kind === 'material' && r.status === 'not_used')
  const extras = lines.filter((r) => r.status === 'not_offered')
  const paired = new Set<string>()
  let unmatched = 0
  for (const row of unused) {
    const hit = extras.find((e) => !paired.has(e.key) && norm(e.description) === norm(row.description))
    if (!hit) continue
    paired.add(hit.key)
    row.status = 'unmatched'
    row.cost_deviation = null
    hit.status = 'unmatched'
    hit.cost_deviation = null
    unmatched += 1
  }
  if (unmatched > 0) {
    warnings.push({
      code: 'unmatched_lines',
      severity: 'info',
      count: unmatched,
      message: `${unmatched} linje(r) har samme tekst som en tilbudslinje, men er ikke koblet. De tælles ikke som samme linje.`,
    })
  }

  const unlinked = lines.filter((r) => r.status === 'not_offered' || r.status === 'unmatched').length
  if (unlinked > 0) {
    warnings.push({
      code: 'unlinked_materials',
      severity: 'warning',
      count: unlinked,
      message: `${unlinked} faktiske linje(r) er ikke koblet til en tilbudslinje.`,
    })
  }

  for (const row of lines) {
    const offeredActive = row.offered_qty != null && row.offered_qty > 0
    const actualActive = row.actual_qty != null && row.actual_qty > 0
    const missing = (offeredActive && row.offered_cost == null) || (actualActive && row.actual_cost == null)
    if (missing) {
      row.status = 'missing_cost'
      row.cost_deviation = null
    }
  }

  // Tilbudte timer med hul i kost: compareOfferToActual summerer kun de kendte linjer. Det er et gæt.
  const labourRow = lines.find((r) => r.kind === 'labour')
  if (labourRow && (quotedLabour == null || actualLabour == null) && ((quotedHours ?? 0) > 0 || actualHours > 0)) {
    if (quotedLabour == null) labourRow.offered_cost = null
    if (actualLabour == null) labourRow.actual_cost = null
    labourRow.cost_deviation = null
    labourRow.status = 'missing_cost'
  }

  const highlight = (row: AftercalcLine, amount: number): AftercalcHighlight => ({
    key: row.key, description: row.description, amount, status: row.status,
  })
  // Ikke-brugte tilbudslinjer har deres egen liste. En negativ afvigelse dér er ikke en reel besparelse på en brugt linje.
  const withDev = lines.filter((r) => r.cost_deviation != null && r.cost_deviation !== 0 && r.status !== 'not_used')
  const worst = withDev.filter((r) => (r.cost_deviation ?? 0) > 0).sort((a, b) => (b.cost_deviation ?? 0) - (a.cost_deviation ?? 0)).slice(0, 3).map((r) => highlight(r, r.cost_deviation ?? 0))
  const best = withDev.filter((r) => (r.cost_deviation ?? 0) < 0).sort((a, b) => (a.cost_deviation ?? 0) - (b.cost_deviation ?? 0)).slice(0, 3).map((r) => highlight(r, r.cost_deviation ?? 0))

  const variance: AftercalcVariance = {
    revenue: varianceAmount(actual.revenue, quoted.revenue),
    material_cost: varianceAmount(actual.material_cost, quoted.material_cost),
    labour_hours: varianceHours(actual.labour_hours, quoted.labour_hours),
    labour_cost: varianceAmount(actual.labour_cost, quoted.labour_cost),
    other_cost: varianceAmount(actual.other_cost, quoted.other_cost),
    total_cost: varianceAmount(actual.total_cost, quoted.total_cost),
    contribution_margin: varianceAmount(actual.contribution_margin, quoted.contribution_margin),
    contribution_margin_pct_points:
      actual.contribution_margin_pct != null && quoted.contribution_margin_pct != null
        ? Math.round((actual.contribution_margin_pct - quoted.contribution_margin_pct) * 100) / 100
        : null,
  }

  const invoiced_state: CaseAftercalc['invoiced_state'] =
    invSum.issuedCount === 0 ? 'not_invoiced' : unbilled > 0 ? 'partially_invoiced' : 'fully_invoiced'

  return {
    quoted,
    actual,
    variance,
    lines,
    worst,
    best,
    unused_offer_lines: lines.filter((r) => r.status === 'not_used').map((r) => highlight(r, r.offered_cost ?? 0)),
    extra_not_offered: lines.filter((r) => r.status === 'not_offered').map((r) => highlight(r, r.actual_cost ?? 0)),
    missing_cost_lines: lines.filter((r) => r.status === 'missing_cost').map((r) => highlight(r, 0)),
    warnings,
    data_quality: warnings.some((w) => w.severity === 'warning') ? 'warning' : 'ok',
    offer: input.offer ? { id: input.offer.id, offer_number: input.offer.offer_number } : null,
    invoiced_state,
  }
}
