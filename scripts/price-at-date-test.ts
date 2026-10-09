/**
 * Unit-tests for kostpris på fakturadatoen og dækningsmålingen (X1 #14). Ingen DB.
 *   npx tsx scripts/price-at-date-test.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { measureCoverage, type CoverageInvoice, type CoverageLine } from '../src/lib/invoice-control/coverage'
import { loadInvoiceControl } from '../src/lib/invoice-control/invoice-control-loader'
import { asPriceChange, costPriceAtDate, expectedCostOnInvoiceDate, priceHistoryAfterIso, type PriceChange } from '../src/lib/invoice-control/price-at-date'
import type { ProductRef } from '../src/lib/invoice-control/line-matcher'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const ch = (old: number | string | null, at: string, id = 'p'): PriceChange => ({ supplier_product_id: id, old_cost_price: old, created_at: at })

eq('ingen ændring efter fakturadatoen → nuværende pris', costPriceAtDate(120, []), 120)
eq('én ændring efter datoen → den gamle pris', costPriceAtDate(120, [ch(100, '2026-10-05T02:00:00Z')]), 100)
eq('flere ændringer → den gamle pris i den FØRSTE (uanset rækkefølge)', costPriceAtDate(140, [ch(120, '2026-10-06T02:00:00Z'), ch(100, '2026-10-05T02:00:00Z')]), 100)
eq('ændring uden kendt gammel pris → kan ikke bestemmes (null, ikke dagens pris)', costPriceAtDate(120, [ch(null, '2026-10-05T02:00:00Z')]), null)
eq('ukendt nuværende pris og ingen ændring → null', costPriceAtDate(null, []), null)
eq('tekstbeløb', costPriceAtDate(120, [ch('99.5', '2026-10-05T02:00:00Z')]), 99.5)

eq('dagen efter 4/10 2026 starter 22:00 UTC (CEST)', priceHistoryAfterIso('2026-10-04'), '2026-10-04T22:00:00.000Z')
eq('tidsstempel skæres til datoen', priceHistoryAfterIso('2026-10-04T18:00:00.000Z'), '2026-10-04T22:00:00.000Z')
eq('uden dato ingen grænse', priceHistoryAfterIso(null), null)
eq('ugyldig dato ingen grænse', priceHistoryAfterIso('4. oktober'), null)

const later = [ch(100, '2026-10-05T02:00:00.000Z')]
const during = [ch(100, '2026-10-04T10:00:00.000Z')]
eq('ændring efter næste danske midnat → gammel pris', expectedCostOnInvoiceDate(120, '2026-10-04', later), 100)
eq('ændring på selve fakturadagen → dagens pris', expectedCostOnInvoiceDate(120, '2026-10-04', during), 120)
eq('ændring præcis ved grænsen hører til næste dag', expectedCostOnInvoiceDate(120, '2026-10-04', [ch(100, '2026-10-04T22:00:00.000Z')]), 100)
eq('kendt gammel pris mangler → null, ikke dagens pris', expectedCostOnInvoiceDate(120, '2026-10-04', [ch(null, '2026-10-05T02:00:00.000Z')]), null)
eq('uden fakturadato bruges dagens pris selv om historik findes', expectedCostOnInvoiceDate(120, null, later), 120)
eq('ugyldig dato bruges dagens pris', expectedCostOnInvoiceDate(120, 'ikke-en-dato', later), 120)
{
  const at = asPriceChange({ supplier_product_id: 'p1', old_cost_price: 100, created_at: new Date('2026-10-05T02:00:00.000Z') })
  eq('Date fra databasen bliver UTC-ISO', at.created_at, '2026-10-05T02:00:00.000Z')
  eq('Date-historik ruller prisen tilbage', expectedCostOnInvoiceDate(120, '2026-10-04', [at]), 100)
}

const product: ProductRef = { id: 'p1', supplier_sku: 'SKU1', ean: null, cost_price: 120 }
const line = (stored: boolean): CoverageLine => ({
  line_number: 1, description: 'kabel', quantity: 1, unit_price: 100,
  supplier_product_id: stored ? 'p1' : null,
  raw_line: stored ? null : JSON.stringify({ supplier_product_code: 'SKU1' }),
})
const invoice = (stored: boolean, date: string | null | undefined): CoverageInvoice => ({
  id: 'inv1', supplier_id: 's1', invoice_date: date, lines: [line(stored)],
})
const bySupplier = new Map<string, ProductRef[]>([['s1', [product]]])
const byId = new Map<string, ProductRef>([['p1', product]])
const history = new Map<string, PriceChange[]>([['p1', later]])

{
  const today = measureCoverage([invoice(true, '2026-10-04')], bySupplier, byId)
  eq('uden historik: 100 mod dagens 120 er en afvigelse', today.verdicts.deviation, 1)
  eq('uden historik: linjen kan kontrolleres', today.coveragePct, 100)
  eq('uden historik: én afvigende linje', today.deviatingLines, 1)
}
{
  const dated = measureCoverage([invoice(true, '2026-10-04')], bySupplier, byId, history)
  eq('med historik: 100 mod 100 på fakturadatoen er ok', dated.verdicts.ok, 1)
  eq('med historik: ingen afvigende linje', dated.deviatingLines, 0)
  eq('med historik: stadig kontrollerbar', dated.coveragePct, 100)
}
{
  const sku = measureCoverage([invoice(false, '2026-10-04')], bySupplier, byId, history)
  eq('varenummer-match rulles også tilbage', sku.verdicts.ok, 1)
  eq('varenummer-match tæller som sku', sku.byMethod.sku, 1)
}
{
  const unknown = measureCoverage([invoice(true, '2026-10-04')], bySupplier, byId, new Map([['p1', [ch(null, '2026-10-05T02:00:00.000Z', 'p1')]]]))
  eq('ukendt gammel pris: ikke en afvigelse mod dagens pris', unknown.verdicts.not_controllable, 1)
  eq('ukendt gammel pris: dækning 0', unknown.coveragePct, 0)
  eq('ukendt gammel pris: ingen merbetaling', unknown.overchargeAmount, 0)
}
{
  const sameDay = measureCoverage([invoice(true, '2026-10-04')], bySupplier, byId, new Map([['p1', during]]))
  eq('ændring på fakturadagen ændrer ikke dækningens dom', sameDay.verdicts.deviation, 1)
}
{
  const noDate = measureCoverage([invoice(true, null)], bySupplier, byId, history)
  eq('tre argumenter og manglende dato bliver på dagens pris', measureCoverage([invoice(true, '2026-10-04')], bySupplier, byId).verdicts.deviation, 1)
  eq('historik uden fakturadato bliver på dagens pris', noDate.verdicts.deviation, 1)
}

{
  const coverageSrc = readFileSync(join(process.cwd(), 'src/lib/invoice-control/coverage.ts'), 'utf8')
  const loader = coverageSrc.slice(coverageSrc.indexOf('export async function loadAndMeasureCoverage'))
  eq('dækningen læser fakturadatoen', loader.includes(".select('id, supplier_id, invoice_date')"), true)
  eq('dækningen læser prishistorik side for side', loader.includes(".select('id, supplier_product_id, old_cost_price, created_at')") && loader.includes('fetchAllRows'), true)
  eq('dækningen giver historikken til målingen', loader.includes('measureCoverage(invoices, productsBySupplier, new Map(stored.map((p) => [p.id, p])), changesByProduct)'), true)
  const panel = readFileSync(join(process.cwd(), 'src/lib/invoice-control/invoice-control-loader.ts'), 'utf8')
  eq('fakturapanelet bruger samme tilbagerulning', panel.includes('expectedCostOnInvoiceDate') && panel.includes('priceHistoryAfterIso'), true)
  eq('fakturapanelet paginerer prishistorik', panel.includes('fetchAllRows') && panel.includes(".order('id')") && panel.includes('.range(from, to)'), true)
  const prod = readFileSync(join(process.cwd(), 'scripts/prod-invoice-coverage.ts'), 'utf8')
  eq('prod-scriptet læser fakturadato og prishistorik', prod.includes('invoice_date::text AS invoice_date') && prod.includes('FROM price_history') && prod.includes('asPriceChange'), true)
  eq('prod-scriptet skriver ikke', !/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/.test(prod), true)
}

// PostgREST giver højst 1000 rækker. Den tidligste tilbagerulning ligger på SIDSTE side (højeste id),
// så ét kald — også med .range(0, 5000) — rammer dagens eller en senere gammel pris.
void (async () => {
  try {
    const total = 1001
    const cutoffMs = Date.parse('2026-10-04T22:00:00.000Z')
    const historyRows = Array.from({ length: total }, (_, i) => {
      const earliest = i === total - 1
      return {
        id: String(i).padStart(5, '0'),
        supplier_product_id: 'p1',
        old_cost_price: earliest ? 100 : 115,
        created_at: new Date(cutoffMs + (earliest ? 0 : (i + 1) * 60_000)).toISOString(),
      }
    })
    let pages = 0
    const from = (table: string) => {
      const state = { ranged: false, from: 0, to: 999 }
      const api: {
        select: () => typeof api
        eq: () => typeof api
        in: () => typeof api
        gte: () => typeof api
        order: () => typeof api
        range: (from: number, to: number) => typeof api
        maybeSingle: () => typeof api
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => unknown
      } = {
        select: () => api,
        eq: () => api,
        in: () => api,
        gte: () => api,
        order: () => api,
        range: (start, end) => { state.ranged = true; state.from = start; state.to = end; pages++; return api },
        maybeSingle: () => api,
        then: (resolve) => {
          if (table === 'incoming_invoices') {
            return resolve({ data: { id: 'inv-old', supplier_id: null, invoice_date: '2026-10-04', amount_excl_vat: 100, vat_amount: 25, amount_incl_vat: 125 }, error: null })
          }
          if (table === 'incoming_invoice_lines') {
            return resolve({ data: [{ line_number: 1, description: 'kabel', quantity: 1, unit_price: 100, total_price: 100, supplier_product_id: 'p1', raw_line: null }], error: null })
          }
          if (table === 'supplier_products') {
            return resolve({ data: [{ id: 'p1', supplier_sku: 'SKU1', ean: null, cost_price: 120 }], error: null })
          }
          if (table === 'price_history') {
            // Uden range: max 1000, og den tidligste række (sidste id) er ikke med.
            // Med range: højst 1000 fra from, samme loft som PostgREST.
            const data = state.ranged
              ? historyRows.slice(state.from, Math.min(state.to + 1, state.from + 1000))
              : historyRows.slice(0, 1000)
            return resolve({ data, error: null })
          }
          return resolve({ data: [], error: null })
        },
      }
      return api
    }
    const client = { from }
    const loaded = await loadInvoiceControl(client, 'inv-old', client)
    eq('over 1000 senere ændringer: første gamle pris, ikke dagens', loaded?.matches[0]?.expectedUnitPrice, 100)
    eq('loader henter historikken over mere end én side', pages >= 2, true)
  } catch (err) {
    bad++
    console.log(`FAIL  loadInvoiceControl  ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle pris-på-dato-tests bestået')
  process.exitCode = bad ? 1 : 0
})()
