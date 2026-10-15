/** Indkoebskortets beloeb stables paa mobil. Kosttal og tom tekst bliver. Koer: npx tsx scripts/purchase-summary-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')

eq('beloeb stables', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-3'), true)
eq('overskrift ombrydes', src.includes('flex flex-wrap items-center gap-2 text-gray-800 min-w-0'), true)
eq('reference ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('intern kost bliver', src.includes('Intern kost'), true)
eq('materialer bliver', src.includes('kr(data.supplier_material_cost_total)'), true)
eq('udlaeg bliver', src.includes('kr(data.supplier_other_cost_total)'), true)
eq('indkoeb i alt bliver', src.includes('kr(data.supplier_purchase_total)'), true)
eq('tom liste bliver', src.includes('Ingen leverandørfaktura-linjer konverteret til denne sag endnu.'), true)
eq('ikke db', src.includes('ikke dækningsbidrag eller margin'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-summary-mobile-test OK')
process.exitCode = fail ? 1 : 0
