/**
 * Opslag i det kendte grossistkatalog. Kalder ingen leverandør og afgiver ingen ordre.
 * En manglende eller ugyldig kostpris er null — aldrig 0.
 */
import { normalizeEan, type SupplierProductRef } from '@/lib/pricing/supplier-compare'

export interface KnownPrice {
  productId: string
  supplierId: string
  supplierName: string
  sku: string
  productName: string
  /** null når kataloget ikke har en brugbar indkøbspris. */
  purchasePrice: number | null
  priceKnown: boolean
}

export interface ProductLookupResult {
  query: { ean: string | null; sku: string | null }
  matches: KnownPrice[]
  lowestKnown: KnownPrice | null
  unknownPriceCount: number
}

function knownPrice(value: number | null): number | null {
  return value != null && value > 0 ? value : null
}

export function lookupKnownProducts(
  products: SupplierProductRef[],
  query: { ean?: string | null; sku?: string | null },
): ProductLookupResult {
  const ean = normalizeEan(query.ean)
  const sku = (query.sku ?? '').trim().toLocaleLowerCase('da')
  const matches = products.filter((p) => {
    if (ean) return normalizeEan(p.ean) === ean
    if (sku) return p.sku.trim().toLocaleLowerCase('da') === sku
    return false
  }).map((p): KnownPrice => {
    const price = knownPrice(p.costPrice)
    return { productId: p.id, supplierId: p.supplierId, supplierName: p.supplierName, sku: p.sku, productName: p.name, purchasePrice: price, priceKnown: price != null }
  }).sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'da') || a.sku.localeCompare(b.sku))

  const known = matches.filter((m) => m.priceKnown && m.purchasePrice != null)
  const lowestKnown = known.reduce<KnownPrice | null>((best, row) => (!best || (row.purchasePrice as number) < (best.purchasePrice as number) ? row : best), null)
  return {
    query: { ean, sku: sku || null },
    matches,
    lowestKnown,
    unknownPriceCount: matches.filter((m) => !m.priceKnown).length,
  }
}
