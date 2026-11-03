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

/** En manglende, tom eller ikke-positiv kost er null. 0 bliver aldrig en pris. */
export function presentPurchasePrice(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function classifyCatalogueQuery(raw: string, mode: 'sku' | 'ean' | 'name'): { ok: true; mode: 'sku' | 'ean' | 'name'; value: string } | { ok: false; reason: string } {
  const text = raw.trim()
  if (mode === 'ean') {
    const ean = normalizeEan(text)
    if (!ean) return { ok: false, reason: 'EAN skal være mindst 7 cifre. Der er ikke søgt.' }
    return { ok: true, mode, value: ean }
  }
  if (mode === 'name') {
    if (text.length < 3) return { ok: false, reason: 'Skriv mindst 3 tegn af varenavnet. Der er ikke søgt.' }
    if (text.length > 80) return { ok: false, reason: 'Søgningen er for lang. Der er ikke søgt.' }
    return { ok: true, mode, value: text }
  }
  if (!text || text.length > 80) return { ok: false, reason: 'Skriv et varenummer. Der er ikke søgt.' }
  return { ok: true, mode: 'sku', value: text }
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
    const price = presentPurchasePrice(p.costPrice)
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
