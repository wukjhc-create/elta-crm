/** Materiale- og udlaegsdialogens felter stables, og dialogen kan rulles. Priserne bliver. Koer: npx tsx scripts/case-cost-dialog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const material = fs.readFileSync('src/app/dashboard/orders/[id]/case-material-dialog.tsx', 'utf8')
const other = fs.readFileSync('src/app/dashboard/orders/[id]/case-other-cost-dialog.tsx', 'utf8')

for (const [name, src] of [['materiale', material], ['udlaeg', other]] as const) {
  eq(`${name} tre felter stables`, src.split('grid grid-cols-1 sm:grid-cols-3 gap-2').length - 1 === 2, true)
  eq(`${name} to felter stables`, src.split('grid grid-cols-1 sm:grid-cols-2 gap-2').length - 1 === 2, true)
  eq(`${name} kan rulles`, src.includes('max-h-[90vh] flex flex-col') && src.includes('overflow-y-auto min-h-0'), true)
  eq(`${name} sum kost bliver`, src.includes('totalCost.toFixed(2)') && src.includes('totalSale.toFixed(2)'), true)
  eq(`${name} luk har et navn`, src.includes('aria-label="Luk"'), true)
  eq(`${name} gem bliver`, src.includes("editing ? 'Gem ændringer' : 'Tilføj'"), true)
}

eq('materiale-note bliver', material.includes('data-testid="material-price-note"'), true)
eq('kontoret saetter udlaegspris', other.includes('data-testid="other-cost-price-by-office"'), true)
eq('showPrices bliver', material.includes('showPrices'), true)
eq('canSetPrices bliver', other.includes('canSetPrices'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-cost-dialog-mobile-test OK')
process.exitCode = fail ? 1 : 0
