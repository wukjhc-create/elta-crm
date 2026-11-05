/**
 * Indkøbssignaler ud fra kendte tal. Opfinder ikke antal eller pris.
 * Et manglende forventet antal sendes som null og bliver ikke et fund:
 * der findes ingen indkøbsordrelinjer at sammenligne med.
 */
import type { PurchasingCheckLine } from '@/lib/invoice-control/traffic-light'

/** Mindst 5 % og mindst 0,50 kr pr. enhed. 1 kr alene på en dyr vare er ikke et fund. */
export function unitPriceMovement(
  today: number | null | undefined,
  atInvoice: number | null | undefined,
): { moved: boolean; diff: number | null } {
  const now = today != null && Number.isFinite(today) && today > 0 ? today : null
  const then = atInvoice != null && Number.isFinite(atInvoice) && atInvoice > 0 ? atInvoice : null
  if (now == null || then == null) return { moved: false, diff: null }
  const raw = now - then
  // Reglen testes på den uafrundede forskel. Tolerancen fjerner kun flydende-tals-støj ved præcis 5 % og 0,50 kr.
  const moved = Math.abs(raw) / then >= 0.05 - FLOAT_NOISE && Math.abs(raw) >= 0.5 - FLOAT_NOISE
  return { moved, diff: Math.round(raw * 100) / 100 }
}

const FLOAT_NOISE = 1e-9

export function duplicateProductLineNumbers(
  lines: Array<{ lineNumber: number; productId: string | null; quantity: number | null }>,
): Set<number> {
  const groups = new Map<string, number[]>()
  for (const line of lines) {
    if (!line.productId || line.quantity == null || !Number.isFinite(line.quantity) || line.quantity === 0) continue
    const key = `${line.productId}:${line.quantity < 0 ? 'kredit' : 'vare'}`
    const list = groups.get(key) ?? []
    list.push(line.lineNumber)
    groups.set(key, list)
  }
  const duplicates = new Set<number>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    for (const lineNumber of list) duplicates.add(lineNumber)
  }
  return duplicates
}

export function purchasingLinesForReview(lines: Array<{
  lineNumber: number
  quantity: number | null
  productId: string | null
  priceAtInvoice: number | null
  priceToday: number | null
}>): PurchasingCheckLine[] {
  const duplicates = duplicateProductLineNumbers(lines)
  const out: PurchasingCheckLine[] = []
  for (const line of lines) {
    const movement = unitPriceMovement(line.priceToday, line.priceAtInvoice)
    const duplicate = duplicates.has(line.lineNumber)
    // Kendt vare uden pris i kataloget i dag: bevægelsen kan ikke afgøres. Det er Ukendt-pris (gul), ikke "ingen bevægelse".
    const priceTodayUnknown = line.productId != null && !(line.priceToday != null && line.priceToday > 0)
    if (!duplicate && !movement.moved && !priceTodayUnknown) continue
    out.push({
      lineNumber: line.lineNumber,
      invoicedQty: line.quantity != null && Number.isFinite(line.quantity) ? line.quantity : null,
      expectedQty: null,
      catalogueUnitPrice: line.priceToday != null && line.priceToday > 0 ? line.priceToday : null,
      previousUnitPrice: line.priceAtInvoice != null && line.priceAtInvoice > 0 ? line.priceAtInvoice : null,
      duplicate,
    })
  }
  return out
}
