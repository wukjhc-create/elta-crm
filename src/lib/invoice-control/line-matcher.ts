/**
 * Fakturalinje -> leverandoerprodukt (P3 #19-opfoelgning). Bevidst IKKE 'use server'.
 *
 * Deterministisk prioritet (kun inden for SAMME leverandoer — en anden grossists vare har en anden aftalepris):
 *   1. 'sku'              leverandoerens varenummer fra API-linjen = supplier_products.supplier_sku
 *   2. 'ean'              samme kode som EAN (grossister sender ofte EAN som varenr.)
 *   3. 'description_sku'  et varenummer-lignende token i linjeteksten matcher supplier_sku/EAN
 * Ingen fuzzy navnematch: et forkert match giver falske prisafvigelser, et manglende match giver blot lavere
 * (aerligt maalt) daekning.
 */

export type LineMatchMethod = 'sku' | 'ean' | 'description_sku'

export interface LineToMatch {
  lineNumber: number
  description: string | null
  supplierProductCode: string | null
}
export interface LineMatch {
  lineNumber: number
  supplierProductId: string | null
  method: LineMatchMethod | null
  expectedUnitCost: number | null
}
export interface ProductRef { id: string; supplier_sku: string | null; ean: string | null; cost_price: number | null }

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase().replace(/\s+/g, '')

/** Varenummer-lignende tokens i en linjetekst: 5–14 tegn, mindst ét ciffer, kun bogstaver/cifre/-/. */
export function extractCodeTokens(description: string | null): string[] {
  if (!description) return []
  const out = new Set<string>()
  for (const raw of description.split(/[\s,;:()[\]]+/)) {
    const t = norm(raw).replace(/^[#.-]+|[#.-]+$/g, '')
    if (t.length >= 5 && t.length <= 14 && /\d/.test(t) && /^[A-Z0-9.-]+$/.test(t)) out.add(t)
  }
  return [...out]
}

/** Alle koder vi vil slaa op for et saet linjer (til én batch-forespoergsel). */
export function codesToLookup(lines: LineToMatch[]): string[] {
  const s = new Set<string>()
  for (const l of lines) {
    if (l.supplierProductCode) s.add(norm(l.supplierProductCode))
    for (const t of extractCodeTokens(l.description)) s.add(t)
  }
  return [...s].filter(Boolean)
}

/** Ren matchning mod et allerede hentet produktudsnit (samme leverandoer). */
export function matchLines(lines: LineToMatch[], products: ProductRef[]): LineMatch[] {
  const bySku = new Map<string, ProductRef>()
  const byEan = new Map<string, ProductRef>()
  // Stabil: ved dubletter vinder laveste id (deterministisk uanset DB-raekkefoelge)
  for (const p of [...products].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.supplier_sku && !bySku.has(norm(p.supplier_sku))) bySku.set(norm(p.supplier_sku), p)
    if (p.ean && !byEan.has(norm(p.ean))) byEan.set(norm(p.ean), p)
  }
  const hit = (p: ProductRef | undefined, method: LineMatchMethod, lineNumber: number): LineMatch | null =>
    p ? { lineNumber, supplierProductId: p.id, method, expectedUnitCost: p.cost_price ?? null } : null
  return lines.map((l) => {
    const code = norm(l.supplierProductCode)
    const direct = code ? (hit(bySku.get(code), 'sku', l.lineNumber) ?? hit(byEan.get(code), 'ean', l.lineNumber)) : null
    if (direct) return direct
    for (const t of extractCodeTokens(l.description)) {
      const m = hit(bySku.get(t), 'description_sku', l.lineNumber) ?? hit(byEan.get(t), 'description_sku', l.lineNumber)
      if (m) return m
    }
    return { lineNumber: l.lineNumber, supplierProductId: null, method: null, expectedUnitCost: null }
  })
}

/** Hent kandidat-produkter for leverandoeren i to batch-opslag (sku + ean) og match. */
 
export async function resolveLineProducts(admin: any, supplierId: string | null, lines: LineToMatch[]): Promise<LineMatch[]> {
  const codes = codesToLookup(lines)
  if (!supplierId || codes.length === 0) return matchLines(lines, [])
  const products: ProductRef[] = []
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200)
    const [a, b] = await Promise.all([
      admin.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', supplierId).in('supplier_sku', chunk),
      admin.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', supplierId).in('ean', chunk),
    ])
    products.push(...((a.data ?? []) as ProductRef[]), ...((b.data ?? []) as ProductRef[]))
  }
  return matchLines(lines, products)
}
