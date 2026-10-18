/**
 * Fakturakontrol for ÉN leverandørfaktura (UI). Samme matching som dækningsmålingen (coverage.ts): gemt produkt-link
 * vinder, ellers deterministisk varenr. → EAN → varenr. i teksten (kun fakturaens leverandør). Klienten gives af kalderen
 * (bruger-session under RLS: linjer er kun læsbare for admin/serviceleder/bogholderi, 00166). Bevidst IKKE 'use server'.
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { controlInvoice, type InvoiceControl } from '@/lib/invoice-control/engine'
import { codeFromRawLine } from '@/lib/invoice-control/coverage'
import { codesToLookup, matchLines, type ProductRef, type LineMatchMethod } from '@/lib/invoice-control/line-matcher'
import { costPriceAtDate, type PriceChange } from '@/lib/invoice-control/price-at-date'
import { copenhagenLocalToIso, copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

export interface InvoiceControlLineInfo {
  lineNumber: number
  method: LineMatchMethod | 'stored' | null
  productSku: string | null
  expectedUnitPrice: number | null
}

export interface InvoiceControlResult { control: InvoiceControl; matches: InvoiceControlLineInfo[]; hasSupplier: boolean }

type Client = { from: (t: string) => any }

/**
 * 00192: supplier_products.cost_price er ikke læsbar for `authenticated` → katalogopslag (kostpriser) sker med
 * `catalogClient` (kalderen giver admin-klienten bag sin gate); faktura og linjer læses fortsat med `client` (RLS).
 */
export async function loadInvoiceControl(client: Client, invoiceId: string, catalogClient: Client = client): Promise<InvoiceControlResult | null> {
  const { data: inv } = await client.from('incoming_invoices').select('id, supplier_id, invoice_date').eq('id', invoiceId).maybeSingle()
  if (!inv) return null
  // IV-14: side for side (store AO-fakturaer har > 1.000 linjer)
  const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
  const rows = await fetchAllRows((f, t) => client.from('incoming_invoice_lines')
    .select('id, line_number, description, quantity, unit, unit_price, total_price, supplier_product_id, raw_line').eq('incoming_invoice_id', invoiceId).order('line_number').order('id').range(f, t))
  const lines = (rows ?? []) as Array<{ line_number: number; description: string | null; quantity: number | null; unit?: string | null; unit_price: number | null; total_price?: number | null; supplier_product_id: string | null; raw_line: string | null }>

  const toMatch = lines.map((l) => ({ lineNumber: l.line_number, description: l.description, supplierProductCode: codeFromRawLine(l.raw_line) }))
  let products: ProductRef[] = []
  if (inv.supplier_id) {
    const codes = codesToLookup(toMatch)
    for (let k = 0; k < codes.length; k += 200) {
      const chunk = codes.slice(k, k + 200)
      const [a, b] = await Promise.all([
        catalogClient.from('supplier_products').select('id, supplier_sku, ean, cost_price, unit').eq('supplier_id', inv.supplier_id).in('supplier_sku', chunk),
        catalogClient.from('supplier_products').select('id, supplier_sku, ean, cost_price, unit').eq('supplier_id', inv.supplier_id).in('ean', chunk),
      ])
      products.push(...((a.data ?? []) as ProductRef[]), ...((b.data ?? []) as ProductRef[]))
    }
  }
  const storedIds = [...new Set(lines.map((l) => l.supplier_product_id).filter(Boolean) as string[])]
  // IV-14 (leverandørfaktura-review 2026-10-18): i bidder á 200 (.in() med >~350 id'er fejlede stille)
  const stored: ProductRef[] = []
  for (let k = 0; k < storedIds.length; k += 200) {
    stored.push(...((((await catalogClient.from('supplier_products').select('id, supplier_sku, ean, cost_price, unit').in('id', storedIds.slice(k, k + 200))).data) ?? []) as ProductRef[]))
  }
  const storedById = new Map(stored.map((p) => [p.id, p]))
  products = [...new Map(products.map((p) => [p.id, p])).values()]

  const matched = matchLines(toMatch, products)

  // X1 #14: forventet pris = kostprisen PÅ FAKTURADATOEN (prisændringer efter datoen rulles tilbage via price_history)
  const changesByProduct = new Map<string, PriceChange[]>()
  const invoiceDate = (inv as { invoice_date?: string | null }).invoice_date
  if (invoiceDate) {
    const productIds = [...new Set([...storedIds, ...(matched.map((m) => m.supplierProductId).filter(Boolean) as string[])])]
    const after = copenhagenLocalToIso(copenhagenDatePlusDays(1, new Date(`${invoiceDate}T12:00:00Z`)), '00:00')
    for (let k = 0; k < productIds.length; k += 200) {
      // Leverandørfaktura-review 2026-10-14 (#9): alle rækker i fast rækkefølge (PostgREST giver højst 1.000 i vilkårlig
      // orden — blev den tidligste ændring efter fakturadatoen skåret fra, kontrolleredes mod en forkert "gammel" pris)
      const chunk = productIds.slice(k, k + 200)
      const ph = await fetchAllRows<PriceChange & { id: string }>((f, t) => catalogClient.from('price_history')
        .select('id, supplier_product_id, old_cost_price, created_at')
        .in('supplier_product_id', chunk).gte('created_at', after)
        .order('created_at', { ascending: true }).order('id').range(f, t))
      for (const c of ph as PriceChange[]) {
        const list = changesByProduct.get(c.supplier_product_id) ?? []
        list.push(c)
        changesByProduct.set(c.supplier_product_id, list)
      }
    }
  }
  const atDate = (productId: string | null | undefined, current: number | null | undefined) =>
    productId ? costPriceAtDate(current ?? null, changesByProduct.get(productId) ?? []) : (current ?? null)

  const matches: InvoiceControlLineInfo[] = []
  const control = controlInvoice(lines.map((l, i) => {
    const st = l.supplier_product_id ? storedById.get(l.supplier_product_id) : undefined
    const m = matched[i]
    const expected = st ? atDate(st.id, st.cost_price) : atDate(m.supplierProductId, m.expectedUnitCost)
    const sku = st?.supplier_sku ?? (m.supplierProductId ? products.find((p) => p.id === m.supplierProductId)?.supplier_sku ?? null : null)
    matches.push({ lineNumber: l.line_number, method: st ? 'stored' : m.method, productSku: sku, expectedUnitPrice: expected })
    const prodUnit = (st as { unit?: string | null } | undefined)?.unit ?? (m.supplierProductId ? (products.find((p) => p.id === m.supplierProductId) as { unit?: string | null } | undefined)?.unit ?? null : null)
    // IV-4 (leverandørfaktura-review 2026-10-18): den FAKTISK fakturerede pris (linjetotal / antal, efter rabat) — ikke
    // listeprisen (som fordelingen allerede bruger, LF-3). Før: 100 m à 4,00 med total 445 = "ok"; liste 100 −30 % = falsk +43 %
    const qty = Number(l.quantity)
    const billedUnit = l.total_price != null && Number.isFinite(Number(l.total_price)) && qty !== 0 && Number.isFinite(qty)
      ? Math.abs(Number(l.total_price) / qty)
      : l.unit_price
    return { lineNumber: l.line_number, description: l.description ?? '', quantity: l.quantity, unitPrice: billedUnit, expectedUnitPrice: expected,
      unit: l.unit ?? null, expectedUnit: prodUnit,
      expectedMissingReason: st || m.supplierProductId ? 'produkt uden kostpris' : inv.supplier_id ? 'intet produktmatch' : 'leverandør ukendt' }
  }))
  return { control, matches: matches.sort((a, b) => a.lineNumber - b.lineNumber), hasSupplier: !!inv.supplier_id }
}
