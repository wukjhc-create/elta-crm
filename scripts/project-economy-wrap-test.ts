/** Projektokonomiens beloeb ombrydes. kr() og fejlteksten bliver. Koer: npx tsx scripts/project-economy-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/orders/case-project-economy-card.tsx', 'utf8')
eq('gitter kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0'), true)
const stat = src.slice(src.indexOf('function Stat'))
eq('celle kan krympe', stat.includes('className="min-w-0"'), true)
eq('beloeb ombrydes', stat.includes('text-base font-semibold break-words'), true)
eq('rest ombrydes', src.includes('text-sm font-semibold break-words'), true)
eq('kontrakt bliver', src.includes('kr(data.contract_sum)'), true)
eq('faktureret bliver', src.includes('kr(data.net_invoiced)'), true)
eq('rest-felt bliver', src.includes('kr(data.remaining_to_invoice)'), true)
eq('fejl er ikke 0', src.includes('Det tælles ikke som 0 kr.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nproject-economy-wrap-test OK')
process.exitCode = fail ? 1 : 0
