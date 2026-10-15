/** Andre omkostninger: datoen kan krympe. Beloeb og gem bliver. Koer: npx tsx scripts/other-cost-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/case-other-cost-dialog.tsx', 'utf8')
eq('dato-gitter kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0'), true)
eq('dato kan krympe', src.includes('type="date"') && src.includes('w-full min-w-0 max-w-full border rounded px-2 py-1.5 text-sm'), true)
eq('datoen bliver', src.includes("update('cost_date', e.target.value)"), true)
eq('kategori bliver', src.includes("update('category', e.target.value as CaseOtherCostCategory)"), true)
eq('kontoret saetter prisen', src.includes('data-testid="other-cost-price-by-office"'), true)
eq('kost bliver', src.includes('totalCost.toFixed(2)') && src.includes('totalSale.toFixed(2)'), true)
eq('gem bliver', src.includes("editing ? 'Gem ændringer' : 'Tilføj'"), true)
eq('to felter stables stadig', src.split('grid grid-cols-1 sm:grid-cols-2 gap-2').length - 1 === 2, true)

console.log(fail ? `\n${fail} fejl` : '\nother-cost-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
