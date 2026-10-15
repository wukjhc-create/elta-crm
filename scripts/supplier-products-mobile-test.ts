/** Leverandoerprisliste paa smaa skaerme. Koer: npx tsx scripts/supplier-products-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const action = fs.readFileSync('src/lib/actions/suppliers.ts', 'utf8')
const start = src.indexOf('data-testid="supplier-products-mobile"')
const end = src.indexOf('hidden md:block bg-white rounded-lg border overflow-hidden overflow-x-auto')
const mobile = src.slice(start, end)
const fn = action.indexOf('export async function getSupplierProducts')
const gate = action.slice(fn, action.indexOf('await getAuthenticatedClient()', fn))

eq('mobil-liste findes', start > 0, true)
eq('tabellen er skjult under md', end > start, true)
eq(
  'kortet viser varenummer, navn og priser',
  mobile.includes('supplier_sku') && mobile.includes('supplier_name') && mobile.includes('cost_price') && mobile.includes('list_price') && mobile.includes('effective_sale_price'),
  true,
)
eq('kortet er ikke en tabel', mobile.includes('<Table') || mobile.includes('<table'), false)
eq('tom liste staar stadig', src.includes('Ingen produkter fundet'), true)
eq('fejl vises som alert', src.includes('role="alert"') && src.includes('{loadError}'), true)
eq('kost-gate ligger paa hentningen', gate.includes("permissionDenied('products.view.cost_prices')"), true)
eq('paging ligger uden for kortet', mobile.includes('Forrige'), false)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-products-mobile-test OK')
process.exitCode = fail ? 1 : 0
