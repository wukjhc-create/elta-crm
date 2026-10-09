/**
 * Kostpris PÅ FAKTURADATOEN (ren logik). Bevidst IKKE 'use server'.
 *
 * Økonomi-review 2026-10-07 (X1 #14): fakturakontrollen sammenlignede med DAGENS kostpris — efter en natlig prissynk
 * viste ældre fakturaer falske over-/underpriser. price_history gemmer hver ændring (gammel → ny pris); prisen på en
 * dato er derfor den GAMLE pris i den første ændring EFTER datoen, eller den nuværende pris hvis intet er ændret siden.
 */
import { copenhagenDatePlusDays, copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'

export type PriceChange = { supplier_product_id: string; old_cost_price: number | string | null; created_at: string }

/** node-pg giver timestamptz som Date. Sammenligningen kræver en UTC-ISO-streng. */
export function asPriceChange(row: { supplier_product_id: string; old_cost_price: number | string | null; created_at: string | Date }): PriceChange {
  return {
    supplier_product_id: row.supplier_product_id,
    old_cost_price: row.old_cost_price,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

/** Starten af dagen efter fakturadatoen, dansk tid. Ændringer før det hører til fakturadagen. */
export function priceHistoryAfterIso(invoiceDate: string | null | undefined): string | null {
  if (!invoiceDate) return null
  const day = invoiceDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  return copenhagenLocalToIso(copenhagenDatePlusDays(1, new Date(`${day}T12:00:00Z`)), '00:00')
}

/**
 * Nuværende kostpris rullet tilbage til fakturadatoen.
 * Uden dato, eller uden ændringer efter datoen, er den nuværende pris svaret.
 */
export function expectedCostOnInvoiceDate(
  currentCost: number | null,
  invoiceDate: string | null | undefined,
  changes: PriceChange[],
): number | null {
  const after = priceHistoryAfterIso(invoiceDate)
  if (!after) return currentCost
  return costPriceAtDate(currentCost, changes.filter((c) => c.created_at >= after))
}

/**
 * @param currentCost nuværende cost_price (null = ukendt)
 * @param changesAfter prisændringer for produktet med created_at EFTER fakturadatoens slutning (vilkårlig rækkefølge)
 */
export function costPriceAtDate(currentCost: number | null, changesAfter: PriceChange[]): number | null {
  if (!changesAfter.length) return currentCost
  const first = [...changesAfter].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  const old = first.old_cost_price == null ? null : Number(first.old_cost_price)
  // En ændring uden kendt gammel pris (fx første import) → vi kan ikke vide prisen på datoen; brug ikke dagens pris
  return old != null && Number.isFinite(old) && old > 0 ? old : null
}
