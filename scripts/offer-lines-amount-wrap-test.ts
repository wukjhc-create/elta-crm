/** Tilbudslinjens mobilbeloeb ombrydes. formatCurrency bliver. Koer: npx tsx scripts/offer-lines-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="offer-lines-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('enhedspris ombrydes', mobile.includes('text-sm text-gray-600 break-words'), true)
eq('total ombrydes', mobile.includes('text-sm font-medium tabular-nums break-words'), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(item.unit_price, currency, 2)'), true)
eq('total bliver', mobile.includes('formatCurrency(item.total, currency, 2)'), true)
eq('antal bliver', mobile.includes('{item.quantity} {item.unit}'), true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{item.description}'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\noffer-lines-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
