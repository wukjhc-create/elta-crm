/**
 * Reel daekningsgrad for fakturakontrol (P3 #19-opfoelgning). REN funktion — datakilden (Supabase-klient paa
 * staging, read-only SQL i prod) leverer input, saa maalingen er identisk begge steder.
 *
 * Daekning = andel af fakturalinjer der KAN kontrolleres (har antal + enhedspris + et produktmatch med kostpris).
 * Linjer uden allerede gemt supplier_product_id matches deterministisk (line-matcher) paa varenr. fra raw_line/tekst.
 * Forventet pris = supplier_products.cost_price (NUVAERENDE nettopris — tilnaermelse indtil prishistorik/aftaler
 * pr. fakturadato findes, se Profit Engine #18 og migration 00165).
 */
import { controlInvoice, type InvoiceVerdict } from '@/lib/invoice-control/engine'
import { matchLines, type LineMatchMethod, type ProductRef } from '@/lib/invoice-control/line-matcher'

export interface CoverageLine {
  line_number: number
  description: string | null
  quantity: number | null
  unit_price: number | null
  supplier_product_id: string | null
  raw_line: string | null
}
export interface CoverageInvoice { id: string; supplier_id: string | null; lines: CoverageLine[] }

export interface CoverageReport {
  invoices: number
  invoicesWithLines: number
  lines: number
  matchedLines: number
  byMethod: Record<LineMatchMethod | 'stored', number>
  controllableLines: number
  coveragePct: number
  verdicts: Record<InvoiceVerdict, number>
  deviatingLines: number
  overchargeAmount: number
}

export function codeFromRawLine(raw: string | null): string | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as { supplier_product_code?: string | null }
    return j.supplier_product_code ?? null
  } catch {
    return null
  }
}

export function measureCoverage(invoices: CoverageInvoice[], productsBySupplier: Map<string, ProductRef[]>, productById: Map<string, ProductRef>): CoverageReport {
  const r: CoverageReport = {
    invoices: invoices.length, invoicesWithLines: 0, lines: 0, matchedLines: 0,
    byMethod: { stored: 0, sku: 0, ean: 0, description_sku: 0 }, controllableLines: 0, coveragePct: 0,
    verdicts: { ok: 0, deviation: 0, partially_controlled: 0, not_controllable: 0 }, deviatingLines: 0, overchargeAmount: 0,
  }
  for (const inv of [...invoices].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!inv.lines.length) { r.verdicts.not_controllable++; continue }
    r.invoicesWithLines++
    r.lines += inv.lines.length
    const products = inv.supplier_id ? productsBySupplier.get(inv.supplier_id) ?? [] : []
    const matched = matchLines(inv.lines.map((l) => ({ lineNumber: l.line_number, description: l.description, supplierProductCode: codeFromRawLine(l.raw_line) })), products)
    const control = controlInvoice(inv.lines.map((l, i) => {
      const stored = l.supplier_product_id ? productById.get(l.supplier_product_id) : undefined
      const m = matched[i]
      const expected = stored?.cost_price ?? m.expectedUnitCost
      if (stored) r.byMethod.stored++
      else if (m.method) r.byMethod[m.method]++
      if (stored || m.supplierProductId) r.matchedLines++
      return {
        lineNumber: l.line_number, description: l.description ?? '', quantity: l.quantity, unitPrice: l.unit_price,
        expectedUnitPrice: expected ?? null,
        expectedMissingReason: stored || m.supplierProductId ? 'produkt uden kostpris' : 'intet produktmatch',
      }
    }))
    r.controllableLines += control.controlledLines
    r.verdicts[control.verdict]++
    r.deviatingLines += control.lines.filter((x) => x.verdict === 'overcharge' || x.verdict === 'undercharge').length
    r.overchargeAmount = Math.round((r.overchargeAmount + control.overchargeAmount) * 100) / 100
  }
  r.coveragePct = r.lines ? Math.round((r.controllableLines / r.lines) * 10000) / 100 : 0
  return r
}

/** Hent input via en Supabase-klient (admin, efter admin-tjek i kalderen) og maal daekningen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadAndMeasureCoverage(admin: any): Promise<CoverageReport> {
  const { codesToLookup } = await import('@/lib/invoice-control/line-matcher')
  const { data: invs } = await admin.from('incoming_invoices').select('id, supplier_id').neq('status', 'cancelled').limit(5000)
  const { data: lines } = await admin.from('incoming_invoice_lines')
    .select('incoming_invoice_id, line_number, description, quantity, unit_price, supplier_product_id, raw_line').limit(50000)
  const invoices: CoverageInvoice[] = ((invs ?? []) as Array<{ id: string; supplier_id: string | null }>).map((i) => ({
    ...i, lines: ((lines ?? []) as Array<CoverageLine & { incoming_invoice_id: string }>).filter((l) => l.incoming_invoice_id === i.id),
  }))
  const productsBySupplier = new Map<string, ProductRef[]>()
  for (const supplierId of [...new Set(invoices.map((i) => i.supplier_id).filter(Boolean) as string[])]) {
    const codes = codesToLookup(invoices.filter((i) => i.supplier_id === supplierId).flatMap((i) => i.lines.map((l) => ({
      lineNumber: l.line_number, description: l.description, supplierProductCode: codeFromRawLine(l.raw_line) }))))
    const found: ProductRef[] = []
    for (let k = 0; k < codes.length; k += 200) {
      const chunk = codes.slice(k, k + 200)
      const [a, b] = await Promise.all([
        admin.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', supplierId).in('supplier_sku', chunk),
        admin.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', supplierId).in('ean', chunk),
      ])
      found.push(...((a.data ?? []) as ProductRef[]), ...((b.data ?? []) as ProductRef[]))
    }
    productsBySupplier.set(supplierId, found)
  }
  const storedIds = [...new Set(invoices.flatMap((i) => i.lines.map((l) => l.supplier_product_id)).filter(Boolean) as string[])]
  const stored: ProductRef[] = storedIds.length
    ? (((await admin.from('supplier_products').select('id, supplier_sku, ean, cost_price').in('id', storedIds)).data ?? []) as ProductRef[]) : []
  return measureCoverage(invoices, productsBySupplier, new Map(stored.map((p) => [p.id, p])))
}
