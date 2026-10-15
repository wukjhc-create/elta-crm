/** Tom fakturasoegning kan ryddes med den samme URL-opdatering. Koer: npx tsx scripts/invoices-empty-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/invoices-overview-client.tsx', 'utf8')

eq('tom soegning kan ryddes', src.includes('data-testid="invoices-clear-search"') && src.includes("updateParams({ q: null })"), true)
eq('soegning skriver stadig q', src.includes("updateParams({ q: e.target.value || null })"), true)
eq('tom tekst skelner soegning', src.includes('Ingen fakturaer matcher søgningen'), true)
eq('soegefeltet fylder bredden paa mobil', src.includes('relative w-full sm:w-56') && src.includes('aria-label="Søg fakturaer"'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoices-empty-search-test OK')
process.exitCode = fail ? 1 : 0
