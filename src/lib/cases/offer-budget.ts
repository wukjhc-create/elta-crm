/**
 * N26a — planlagte timer og internt kostbudget for en sag ud fra tilbuddets linjer (ren logik, ingen I/O).
 * Grundlag for efterkalkulation (tilbudt vs. faktisk). Før blev kun contract_sum kopieret → planned_hours/budget tomme.
 *   planned_hours = sum af antal på timelinjer (enhed t/time/timer — samme regel som lønsomhedsanalysen)
 *   budget        = sum af antal × kostpris for linjer MED kendt kost (cost_price ?? leverandørkost); linjer uden kost
 *                   tælles op, så sagen kan vise at budgettet er ufuldstændigt.
 */
import { isLabourUnit } from '@/lib/profit/offer-analysis'

export interface OfferBudgetLine {
  quantity: number | string | null
  unit: string | null
  cost_price: number | string | null
  supplier_cost_price_at_creation?: number | string | null
}

export interface OfferBudget {
  plannedHours: number | null
  budget: number | null
  linesWithoutCost: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function deriveCaseBudgetFromOffer(lines: OfferBudgetLine[]): OfferBudget {
  let hours = 0, cost = 0, anyCost = false, missing = 0
  for (const l of lines) {
    const qty = Number(l.quantity ?? 0) || 0
    if (isLabourUnit(l.unit)) hours += qty
    const unitCost = Number(l.cost_price ?? 0) || Number(l.supplier_cost_price_at_creation ?? 0) || 0
    if (unitCost > 0) { cost += qty * unitCost; anyCost = true } else missing += 1
  }
  return { plannedHours: hours > 0 ? r2(hours) : null, budget: anyCost ? r2(cost) : null, linesWithoutCost: missing }
}

export function offerBudgetNote(b: OfferBudget): string | null {
  const parts: string[] = []
  if (b.plannedHours != null) parts.push(`${b.plannedHours.toLocaleString('da-DK')} planlagte timer`)
  if (b.budget != null) parts.push(`kostbudget ${b.budget.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`)
  if (!parts.length) return null
  const warn = b.linesWithoutCost > 0 ? ` (${b.linesWithoutCost} tilbudslinje(r) uden kostpris — budgettet er ufuldstændigt)` : ''
  return `Fra tilbuddet: ${parts.join(' og ')}${warn}.`
}
