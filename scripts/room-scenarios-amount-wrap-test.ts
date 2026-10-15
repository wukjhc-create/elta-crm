/** Rumkalkulatorens scenariebeloeb og noeglekort ombrydes. formatCurrency bliver. Koer: npx tsx scripts/room-scenarios-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
const start = src.indexOf('data-testid="room-scenarios-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('salgspris ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words">Salgspris'), true)
eq('slutpris ombrydes', mobile.includes('text-xs tabular-nums font-medium text-gray-900 break-words">Slutpris inkl. moms'), true)
eq('db ombrydes', mobile.includes('tabular-nums break-words ${s.db_amount < 0'), true)
eq('db time ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words">DB/time'), true)
eq('salgspris bliver', mobile.includes('formatCurrency(s.net_price)'), true)
eq('slutpris bliver', mobile.includes('formatCurrency(s.final_amount)'), true)
eq('db bliver', mobile.includes('formatCurrency(s.db_amount)'), true)
eq('db time bliver', mobile.includes('formatCurrency(s.db_per_hour)'), true)
eq('margin bliver', mobile.includes('{s.margin_percentage}%'), true)
eq('rabat bliver', mobile.includes('{s.discount_percentage}%'), true)
eq('db procent bliver', mobile.includes('s.db_percentage.toFixed(1)'), true)
eq('standard bliver', mobile.includes("s.name === 'Standard margin'"), true)
eq('noeglekort kan krympe', src.includes('grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 min-w-0'), true)
eq('kortvaerdi ombrydes', src.includes('text-lg font-bold mt-1 break-words'), true)
eq('kortet kan krympe', src.includes('min-w-0 rounded-lg border p-3'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nroom-scenarios-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
