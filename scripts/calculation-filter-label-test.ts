/** Kalkulationslisten navngiver soegning, type og skabelon. Filtrene bliver. Koer: npx tsx scripts/calculation-filter-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calculations/calculations-client.tsx', 'utf8')
eq('soegning har et navn', src.includes('aria-label="Søg efter kalkulationer"'), true)
eq('pladsholder bliver', src.includes('placeholder="Søg efter kalkulationer..."'), true)
eq('type har et navn', src.includes('aria-label="Type"'), true)
eq('skabelon har et navn', src.includes('aria-label="Skabelon"'), true)
eq('type fylder bredden paa mobil', src.includes('w-full sm:w-[180px]'), true)
eq('skabelon fylder bredden paa mobil', src.includes('w-full sm:w-[150px]'), true)
eq('type-filter bliver', src.includes("updateFilters({ calculation_type: value })"), true)
eq('skabelon-filter bliver', src.includes("updateFilters({ is_template: value })"), true)

console.log(fail ? `\n${fail} fejl` : '\ncalculation-filter-label-test OK')
process.exitCode = fail ? 1 : 0
