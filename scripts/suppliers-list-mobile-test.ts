/** Leverandoerkort ombrydes, og en tom soegning kan ryddes. Koer: npx tsx scripts/suppliers-list-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/suppliers-list.tsx', 'utf8')
const emptyStart = src.indexOf('data-testid="suppliers-empty"')
const empty = src.slice(emptyStart, src.indexOf('filteredSuppliers.map', emptyStart))
const card = src.slice(src.indexOf('filteredSuppliers.map'), src.indexOf('Create Dialog'))

eq('tom soegning kan ryddes', empty.includes('data-testid="suppliers-clear-search"') && empty.includes("setSearch('')"), true)
eq('tomt katalog siger stadig opret', empty.includes('Ingen leverandører endnu') && empty.includes('Opret din første leverandør'), true)
eq('navnet ombrydes', card.includes('break-words') && card.includes('supplier.name'), true)
eq('handlinger ombrydes', card.includes('flex flex-wrap items-center gap-2') && card.includes('Produkter') && card.includes('Import') && card.includes('Indstillinger'), true)
eq('mail ombrydes', card.includes('break-all') && card.includes('supplier.contact_email'), true)

console.log(fail ? `\n${fail} fejl` : '\nsuppliers-list-mobile-test OK')
process.exitCode = fail ? 1 : 0
