/** Leverandørsøgning på tilbuddet ombryder produktnavn og badges. Koer: npx tsx scripts/offer-product-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('supplierSearchResults.map')
const row = src.slice(start, src.indexOf('handleAddSupplierProduct(p.id)', start))

eq('produktnavn ombrydes', row.includes('break-words mt-0.5">{p.product_name}'), true)
eq('badges ombrydes', row.includes('flex flex-wrap items-center gap-2'), true)
eq('foraeldet pris bliver', row.includes('data-testid="supplier-price-stale"'), true)
eq('kost bag showFinancials', row.includes('{showFinancials &&'), true)
eq('bedste pris bliver', row.includes('Bedste pris'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-product-name-test OK')
process.exitCode = fail ? 1 : 0
