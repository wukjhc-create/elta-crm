/** Tom produktsogning kan ryddes. Katalog uden filter er uændret. Koer: npx tsx scripts/products-empty-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/products/products-client.tsx', 'utf8')
const start = src.indexOf('data-testid="products-empty"')
const end = src.indexOf('data-testid="products-mobile"')
const empty = src.slice(start, end)

eq('tom tilstand findes', start > 0 && end > start, true)
eq('katalog uden filter siger stadig ingen produkter', empty.includes('Ingen produkter fundet'), true)
eq('soegning uden traef siger at intet matchede', empty.includes('Ingen produkter matcher søgningen'), true)
eq('ryd bruger de samme filtre', src.includes("updateFilters({ search: '', category_id: 'all' })"), true)
eq('ryd-knap har et testid', empty.includes('data-testid="products-clear-filters"'), true)
eq('opret-knap bliver naar der ikke er et filter', empty.includes('Opret produkt'), true)

console.log(fail ? `\n${fail} fejl` : '\nproducts-empty-search-test OK')
process.exitCode = fail ? 1 : 0
