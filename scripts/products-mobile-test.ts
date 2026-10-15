/** Produktkatalog paa smaa skaerme. Kost kraever canSeeCost. Koer: npx tsx scripts/products-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/products/products-client.tsx', 'utf8')
const start = src.indexOf('data-testid="products-mobile"')
const end = src.indexOf('hidden md:block bg-white rounded-lg border overflow-x-auto')
const mobile = src.slice(start, end)
const cost = mobile.indexOf('Kostpris')

eq('mobil-liste findes', start > 0, true)
eq('tabellen er skjult under md', end > start, true)
eq('kortet viser navn, sku og listepris', mobile.includes('product.name') && mobile.includes('product.sku') && mobile.includes('list_price'), true)
eq('kost paa kortet kraever canSeeCost', cost > mobile.lastIndexOf('{canSeeCost && (', cost) && mobile.lastIndexOf('{canSeeCost && (', cost) > 0, true)
eq('kortet er ikke en tabel', mobile.includes('<Table') || mobile.includes('<th'), false)
eq('tom tekst er der stadig', src.includes('Ingen produkter fundet'), true)
eq('handlinger har et navn', src.includes('aria-label="Flere handlinger"'), true)
eq('paging ligger uden for kortet', mobile.includes('Pagination'), false)

console.log(fail ? `\n${fail} fejl` : '\nproducts-mobile-test OK')
process.exitCode = fail ? 1 : 0
