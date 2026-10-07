/**
 * Kost og salg for et tilbud til margin-advarslen (intelligence-check). Ren logik, bevidst IKKE 'use server'.
 *
 * Profit-review 2026-10-07: kosten var summen af enheds-kostpriser (uden antal), mens salget var linjetotaler
 * (antal × pris) → marginen blev overvurderet for alle linjer med antal > 1, og lav-margin-tilbud gav ingen advarsel.
 * Nu: kost = kostpris × antal. Salg = alle linjetotaler (uændret); linjer uden kostpris tælles op, så kalderen kan
 * vise at marginen er beregnet med ukendt kost.
 */
export interface OfferMarginLine {
  cost_price: number | string | null
  quantity: number | string | null
  total: number | string | null
}

export function offerCostAndSale(lines: OfferMarginLine[]): { totalCost: number; totalSale: number; linesWithoutCost: number } {
  let totalCost = 0
  let totalSale = 0
  let linesWithoutCost = 0
  for (const l of lines) {
    const cost = Number(l.cost_price ?? 0) || 0
    if (cost <= 0) linesWithoutCost++
    else totalCost += cost * (Number(l.quantity ?? 0) || 0)
    totalSale += Number(l.total ?? 0) || 0
  }
  return { totalCost: Math.round(totalCost * 100) / 100, totalSale: Math.round(totalSale * 100) / 100, linesWithoutCost }
}
