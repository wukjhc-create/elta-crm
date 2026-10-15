/** Rumkalkulatorens scenarier kan laeses paa mobil. Tallene bliver. Koer: npx tsx scripts/room-scenarios-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
const start = src.indexOf('data-testid="room-scenarios-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('navn ombrydes', mobile.includes('break-words">{s.name}'), true)
eq('margin bliver', mobile.includes('{s.margin_percentage}%'), true)
eq('rabat bliver', mobile.includes('{s.discount_percentage}%'), true)
eq('salgspris bliver', mobile.includes('formatCurrency(s.net_price)'), true)
eq('slutpris bliver', mobile.includes('formatCurrency(s.final_amount)'), true)
eq('db bliver', mobile.includes('formatCurrency(s.db_amount)'), true)
eq('db procent bliver', mobile.includes('s.db_percentage.toFixed(1)'), true)
eq('db time bliver', mobile.includes('formatCurrency(s.db_per_hour)'), true)
eq('standard bliver', mobile.includes("s.name === 'Standard margin'"), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)

console.log(fail ? `\n${fail} fejl` : '\nroom-scenarios-mobile-test OK')
process.exitCode = fail ? 1 : 0
