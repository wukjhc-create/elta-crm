/** Pakkesoegning og kategori har et navn. Pris og soegeknap bliver. Koer: npx tsx scripts/package-search-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/packages/packages-client.tsx', 'utf8')
eq('feltet har et navn', src.includes('aria-label="Søg efter pakker"'), true)
eq('pladsholder bliver', src.includes('placeholder="Søg efter pakker..."'), true)
eq('kategori har et navn', src.includes('aria-label="Kategori"'), true)
eq('soegeknap bliver', src.includes('aria-label="Søg pakker"'), true)
eq('kostpris bliver', src.includes('formatCurrency(pkg.total_cost_price)'), true)
eq('salgspris bliver', src.includes('formatCurrency(pkg.total_sale_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\npackage-search-label-test OK')
process.exitCode = fail ? 1 : 0
