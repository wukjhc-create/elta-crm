/**
 * Fakturakontrol for ÉN leverandørfaktura (UI). Samme matching som dækningsmålingen (coverage.ts): gemt produkt-link
 * vinder, ellers deterministisk varenr. → EAN → varenr. i teksten (kun fakturaens leverandør). Klienten gives af kalderen
 * (bruger-session under RLS: linjer er kun læsbare for admin/serviceleder/bogholderi, 00166). Bevidst IKKE 'use server'.
 */
import { controlInvoice, type InvoiceControl } from '@/lib/invoice-control/engine'
import { codeFromRawLine } from '@/lib/invoice-control/coverage'
import { codesToLookup, matchLines, type ProductRef, type LineMatchMethod } from '@/lib/invoice-control/line-matcher'

export interface InvoiceControlLineInfo {
  lineNumber: number
  method: LineMatchMethod | 'stored' | null
  productSku: string | null
  expectedUnitPrice: number | null
}

export interface InvoiceControlResult { control: InvoiceControl; matches: InvoiceControlLineInfo[]; hasSupplier: boolean }

type Client = { from: (t: string) => any }

export async function loadInvoiceControl(client: Client, invoiceId: string): Promise<InvoiceControlResult | null> {
  const { data: inv } = await client.from('incoming_invoices').select('id, supplier_id').eq('id', invoiceId).maybeSingle()
  if (!inv) return null
  const { data: rows } = await client.from('incoming_invoice_lines')
    .select('line_number, description, quantity, unit_price, supplier_product_id, raw_line').eq('incoming_invoice_id', invoiceId).order('line_number')
  const lines = (rows ?? []) as Array<{ line_number: number; description: string | null; quantity: number | null; unit_price: number | null; supplier_product_id: string | null; raw_line: string | null }>

  const toMatch = lines.map((l) => ({ lineNumber: l.line_number, description: l.description, supplierProductCode: codeFromRawLine(l.raw_line) }))
  let products: ProductRef[] = []
  if (inv.supplier_id) {
    const codes = codesToLookup(toMatch)
    for (let k = 0; k < codes.length; k += 200) {
      const chunk = codes.slice(k, k + 200)
      const [a, b] = await Promise.all([
        client.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', inv.supplier_id).in('supplier_sku', chunk),
        client.from('supplier_products').select('id, supplier_sku, ean, cost_price').eq('supplier_id', inv.supplier_id).in('ean', chunk),
      ])
      products.push(...((a.data ?? []) as ProductRef[]), ...((b.data ?? []) as ProductRef[]))
    }
  }
  const storedIds = [...new Set(lines.map((l) => l.supplier_product_id).filter(Boolean) as string[])]
  const stored = storedIds.length ? (((await client.from('supplier_products').select('id, supplier_sku, ean, cost_price').in('id', storedIds)).data ?? []) as ProductRef[]) : []
  const storedById = new Map(stored.map((p) => [p.id, p]))
  products = [...new Map(products.map((p) => [p.id, p])).values()]

  const matched = matchLines(toMatch, products)
  const matches: InvoiceControlLineInfo[] = []
  const control = controlInvoice(lines.map((l, i) => {
    const st = l.supplier_product_id ? storedById.get(l.supplier_product_id) : undefined
    const m = matched[i]
    const expected = st?.cost_price ?? m.expectedUnitCost ?? null
    const sku = st?.supplier_sku ?? (m.supplierProductId ? products.find((p) => p.id === m.supplierProductId)?.supplier_sku ?? null : null)
    matches.push({ lineNumber: l.line_number, method: st ? 'stored' : m.method, productSku: sku, expectedUnitPrice: expected })
    return { lineNumber: l.line_number, description: l.description ?? '', quantity: l.quantity, unitPrice: l.unit_price, expectedUnitPrice: expected,
      expectedMissingReason: st || m.supplierProductId ? 'produkt uden kostpris' : inv.supplier_id ? 'intet produktmatch' : 'leverandør ukendt' }
  }))
  return { control, matches: matches.sort((a, b) => a.lineNumber - b.lineNumber), hasSupplier: !!inv.supplier_id }
}
