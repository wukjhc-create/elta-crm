/** De daglige soegefelter har et navn. Soegningen selv bliver. Koer: npx tsx scripts/search-field-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const read = (p: string) => fs.readFileSync(p, 'utf8')
const suppliers = read('src/components/modules/suppliers/suppliers-list.tsx')
const products = read('src/components/modules/suppliers/supplier-products-table.tsx')
const customers = read('src/components/modules/customers/customers-page-client.tsx')
const globalSearch = read('src/components/layout/global-search.tsx')
const projects = read('src/components/modules/projects/projects-page-client.tsx')

eq('leverandoer har et navn', suppliers.includes('aria-label="Søg leverandører"') && suppliers.includes('placeholder="Søg leverandører..."'), true)
eq('produkter har et navn', products.includes('aria-label="Søg leverandørprodukter"') && products.includes('placeholder="Søg varenummer, navn, EAN..."'), true)
eq('kunder har et navn', customers.includes('aria-label="Søg kunder"') && customers.includes('placeholder="Søg efter navn, email, kundenummer..."'), true)
eq('global soegning har et navn', globalSearch.includes('aria-label="Søg i ELTA"') && globalSearch.includes('navigateToResult(result)'), true)
eq('projekter har et navn', projects.includes('aria-label="Søg projekter"') && projects.includes('placeholder="Søg efter projektnummer, navn eller kunde..."'), true)
eq('ryd kunder bliver', customers.includes('aria-label="Ryd søgning"'), true)

console.log(fail ? `\n${fail} fejl` : '\nsearch-field-label-test OK')
process.exitCode = fail ? 1 : 0
