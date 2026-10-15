/** Produktsogning og kategori har et navn. Filter og tom tilstand bliver. Koer: npx tsx scripts/product-search-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/products/products-client.tsx', 'utf8')
eq('soegning har et navn', src.includes('aria-label="Søg efter produkter"'), true)
eq('pladsholder bliver', src.includes('placeholder="Søg efter produkter..."'), true)
eq('kategori har et navn', src.includes('aria-label="Kategori"'), true)
const select = fs.readFileSync('src/components/ui/select.tsx', 'utf8')
eq('udloeseren sender navnet videre', select.includes('aria-label={ariaLabel}'), true)
eq('aabn og luk bliver', select.includes('onClick={() => setOpen(!open)}'), true)
eq('ryd bliver', src.includes("updateFilters({ search: '', category_id: 'all' })"), true)
eq('tom soegning bliver', src.includes('Ingen produkter matcher søgningen'), true)

console.log(fail ? `\n${fail} fejl` : '\nproduct-search-label-test OK')
process.exitCode = fail ? 1 : 0
