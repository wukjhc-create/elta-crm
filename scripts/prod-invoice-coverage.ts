/**
 * PRODUCTION read-only: reel daekningsgrad for fakturakontrol (kun antal/beloeb, ingen id'er eller tekster).
 *   npx tsx scripts/prod-invoice-coverage.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { measureCoverage, codeFromRawLine, type CoverageInvoice } from '../src/lib/invoice-control/coverage'
import { codesToLookup, type ProductRef } from '../src/lib/invoice-control/line-matcher'

const uuidRe = /^[0-9a-f-]{36}$/i
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

withProdReadOnly('prod-invoice-coverage', async (run, masked) => {
  const invs = (await run(`SELECT id, supplier_id FROM incoming_invoices WHERE status <> 'cancelled'`)) as Array<{ id: string; supplier_id: string | null }>
  const lines = (await run(`SELECT incoming_invoice_id, line_number, description, quantity::float quantity, unit_price::float unit_price, supplier_product_id, raw_line FROM incoming_invoice_lines`)) as any[]
  const invoices: CoverageInvoice[] = invs.map((i) => ({ ...i, lines: lines.filter((l) => l.incoming_invoice_id === i.id) }))
  const productsBySupplier = new Map<string, ProductRef[]>()
  for (const inv of invoices) {
    if (!inv.supplier_id || !uuidRe.test(inv.supplier_id) || productsBySupplier.has(inv.supplier_id)) continue
    const codes = codesToLookup(invoices.filter((x) => x.supplier_id === inv.supplier_id).flatMap((x) => x.lines.map((l) => ({ lineNumber: l.line_number, description: l.description, supplierProductCode: codeFromRawLine(l.raw_line) }))))
    const rows = codes.length ? (await run(`SELECT id, supplier_sku, ean, cost_price::float cost_price FROM supplier_products WHERE supplier_id = '${inv.supplier_id}'
      AND (upper(supplier_sku) IN (${codes.map(q).join(',')}) OR upper(ean) IN (${codes.map(q).join(',')}))`)) as ProductRef[] : []
    productsBySupplier.set(inv.supplier_id, rows)
  }
  const storedIds = lines.map((l) => l.supplier_product_id).filter((x: string | null) => x && uuidRe.test(x))
  const stored = storedIds.length ? (await run(`SELECT id, supplier_sku, ean, cost_price::float cost_price FROM supplier_products WHERE id IN (${storedIds.map(q).join(',')})`)) as ProductRef[] : []
  const r = measureCoverage(invoices, productsBySupplier, new Map(stored.map((p) => [p.id, p])))
  console.log(`--- fakturakontrol-daekning @ prod:${masked} ---`)
  console.log(JSON.stringify(r, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
