/** Tilbud viser hele part, kunde og prislinje. Beløb og opdatering er de samme. Kør: npx tsx scripts/offer-party-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const parties = fs.readFileSync('src/components/modules/offers/offer-parties-card.tsx', 'utf8')
const table = fs.readFileSync('src/components/modules/offers/offers-table.tsx', 'utf8')
const prices = fs.readFileSync('src/components/modules/offers/offer-supplier-price-changes.tsx', 'utf8')

eq('part ombrydes', parties.includes('hover:underline block break-words') && parties.includes('text-sm text-gray-500 break-words'), true)
eq('part klippes ikke', parties.includes('truncate'), false)
eq('ukendt kunde bliver', parties.includes("'Ukendt kunde'"), true)
eq('listekunde ombrydes', table.includes('md:hidden text-xs text-gray-600 break-words'), true)
eq('desktop-kunde ombrydes', table.split('text-sm font-medium text-gray-900 hover:text-primary break-words').length - 1, 2)
eq('primaer part ombrydes', parties.includes('text-sm text-gray-700 break-words'), true)
eq('tilbudsbelaab bliver', table.includes('formatCurrency(offer.final_amount, currency)'), true)
eq('prislinje ombrydes', prices.includes('min-w-0 break-words">{r.description}'), true)
eq('prislinje klippes ikke', prices.includes('truncate'), false)
eq('kost og procent bliver', prices.includes('kr(r.oldCost)') && prices.includes('kr(r.newCost)') && prices.includes('data-testid="supplier-price-delta"'), true)
eq('opdater pris bliver', prices.includes('data-testid="supplier-price-refresh"') && prices.includes('Sendte tilbud ændres ikke.'), true)
eq('beloeb kraever showAmounts', prices.includes('{showAmounts &&'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-party-wrap-test OK')
process.exitCode = fail ? 1 : 0
