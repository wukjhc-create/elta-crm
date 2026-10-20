/**
 * Viser en lagret kostpris. Mangler den, siges det. 0 kr er en lagret nul, ikke en opfundet pris.
 */
import { formatCurrency } from '@/lib/utils/format'

export function storedCostText(price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return 'Ingen lagret pris'
  return formatCurrency(price)
}
