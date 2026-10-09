/**
 * Fakturakontrol for ÉN leverandørfaktura (UI). Samme matching som dækningsmålingen (coverage.ts): gemt produkt-link
 * vinder, ellers deterministisk varenr. → EAN → varenr. i teksten (kun fakturaens leverandør). Klienten gives af kalderen
 * (bruger-session under RLS: linjer er kun læsbare for admin/serviceleder/bogholderi, 00166). Bevidst IKKE 'use server'.
 */
import { controlInvoice, type InvoiceControl } from '@/lib/invoice-control/engine'
import { headerLineCheck, type HeaderLineCheck } from '@/lib/invoice-control/header-totals'
import { codeFromRawLine } from '@/lib/invoice-control/coverage'
import { codesToLookup, matchLines, type ProductRef, type LineMatchMethod } from '@/lib/invoice-control/line-matcher'
import { asPriceChange, expectedCostOnInvoiceDate, priceHistoryAfterIso, type PriceChange } from '@/lib/invoice-control/price-at-date'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export interface InvoiceControlLineInfo {
  lineNumber: number
  method: LineMatchMethod | 'stored' | null
  productSku: string | null
  expectedUnitPrice: number | null
}

export interface InvoiceControlResult {
  control: InvoiceControl
  matches: InvoiceControlLineInfo[]
  hasSupplier: boolean
  /** IC8. Kun visning. Ændrer ikke godkendelse eller bogføring. */
  header: HeaderLineCheck
}

type Client = { from: (t: string) => any }

/**
 * 00192: supplier_products.cost_price er ikke læsbar for `authenticated` → katalogopslag (kostpriser) sker med
 * `catalogClient` (kalderen giver admin-klienten bag sin gate); faktura og linjer læses fortsat med `client` (RLS).
 */
export async function loadInvoiceControl(client: Client, invoiceId: string, catalogClient: Client = client): Promise<InvoiceControlResult | null> {
  const { data: inv } = await client.from('incoming_invoices').select('id, supplier_id, invoice_date, amount_excl_vat, vat_amount, amount_incl_vat').eq('id', invoiceId).maybeSingle()
  if (!inv) return null
  const { data: rows } = await client.from('incoming_invoice_lines')
    .select('line_number, description, quantity, unit_price, total_price, supplier_product_id, raw_line').eq('incoming_invoice_id', invoiceId).order('line_number')
  const lines = (rows ?? []) as Array<{ line_number: number; description: string | null; quantity: number | null; unit_price: number | null; total_price: number | string | null; supplier_product_id: string | null; raw_line: string | null }>

  const toMatch = lines.map((l) => ({ lineNumber: l.line_number, description: l.description, supplierProductCode: codeFromRawLine(l.raw_line) }))
  let products: ProductRef[] = []
  if (inv.supplier_id) {
    const codes = codesToLookup(toMatch)
    for (let k = 0; k < codes.length; k += 200) {
      const chunk = codes.slice(k, k + 200)
      const [a, b] = await Promise.all([
        catalogClient.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', inv.supplier_id).in('supplier_sku', chunk),
        catalogClient.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', inv.supplier_id).in('ean', chunk),
      ])
      products.push(...((a.data ?? []) as ProductRef[]), ...((b.data ?? []) as ProductRef[]))
    }
  }
  const storedIds = [...new Set(lines.map((l) => l.supplier_product_id).filter(Boolean) as string[])]
  const stored = storedIds.length ? (((await catalogClient.from('supplier_products').select('id, supplier_sku, ean, cost_price').in('id', storedIds)).data ?? []) as ProductRef[]) : []
  const storedById = new Map(stored.map((p) => [p.id, p]))
  products = [...new Map(products.map((p) => [p.id, p])).values()]

  const matched = matchLines(toMatch, products)

  // X1 #14: forventet pris = kostprisen PÅ FAKTURADATOEN (prisændringer efter datoen rulles tilbage via price_history)
  const changesByProduct = new Map<string, PriceChange[]>()
  const invoiceDate = (inv as { invoice_date?: string | null }).invoice_date
  if (invoiceDate) {
    const productIds = [...new Set([...storedIds, ...(matched.map((m) => m.supplierProductId).filter(Boolean) as string[])])]
    const after = priceHistoryAfterIso(invoiceDate)
    // PostgREST giver højst 1000 rækker pr. kald. Ét .in().gte() taber den tidligste tilbagerulning,
    // når 200 produkter har mere end 1000 ændringer efter fakturadatoen. Samme paging som dækningen.
    for (let k = 0; k < productIds.length && after; k += 200) {
      const ids = productIds.slice(k, k + 200)
      const rows = await fetchAllRows<PriceChange & { id: string }>((from, to) => catalogClient.from('price_history')
        .select('id, supplier_product_id, old_cost_price, created_at')
        .in('supplier_product_id', ids).gte('created_at', after).order('id').range(from, to))
      for (const c of rows) {
        const list = changesByProduct.get(c.supplier_product_id) ?? []
        list.push(asPriceChange(c))
        changesByProduct.set(c.supplier_product_id, list)
      }
    }
  }
  const atDate = (productId: string | null | undefined, current: number | null | undefined) =>
    expectedCostOnInvoiceDate(current ?? null, invoiceDate, productId ? changesByProduct.get(productId) ?? [] : [])

  const matches: InvoiceControlLineInfo[] = []
  const control = controlInvoice(lines.map((l, i) => {
    const st = l.supplier_product_id ? storedById.get(l.supplier_product_id) : undefined
    const m = matched[i]
    const expected = st ? atDate(st.id, st.cost_price) : atDate(m.supplierProductId, m.expectedUnitCost)
    const sku = st?.supplier_sku ?? (m.supplierProductId ? products.find((p) => p.id === m.supplierProductId)?.supplier_sku ?? null : null)
    matches.push({ lineNumber: l.line_number, method: st ? 'stored' : m.method, productSku: sku, expectedUnitPrice: expected })
    return { lineNumber: l.line_number, description: l.description ?? '', quantity: l.quantity, unitPrice: l.unit_price, expectedUnitPrice: expected,
      expectedMissingReason: st || m.supplierProductId ? 'produkt uden kostpris' : inv.supplier_id ? 'intet produktmatch' : 'leverandør ukendt' }
  }))
  const header = headerLineCheck({
    amountExclVat: (inv as { amount_excl_vat?: number | string | null }).amount_excl_vat ?? null,
    vatAmount: (inv as { vat_amount?: number | string | null }).vat_amount ?? null,
    amountInclVat: (inv as { amount_incl_vat?: number | string | null }).amount_incl_vat ?? null,
    lines: lines.map((l) => ({ totalPrice: l.total_price, quantity: l.quantity, unitPrice: l.unit_price })),
  })
  return { control, matches: matches.sort((a, b) => a.lineNumber - b.lineNumber), hasSupplier: !!inv.supplier_id, header }
}
