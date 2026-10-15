/** Kundens fakturahaendelse ombryder beloeb. kr() og handlingen bliver. Koer: npx tsx scripts/customer-invoice-event-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/customers/customer-invoice-overview.tsx', 'utf8')
const start = src.indexOf('Seneste faktura-hændelser')
const end = src.indexOf('Omkostningsfrit overblik', start)
const events = src.slice(start, end)
eq('haendelsen findes', start > 0 && end > start, true)
eq('beloeb ombrydes', events.includes('text-gray-700 break-words min-w-0'), true)
eq('beloeb er ikke shrink-0', events.includes('text-gray-700 shrink-0'), false)
eq('beloeb bliver', events.includes('kr(e.amount_incl_vat)'), true)
eq('handling ombrydes', events.includes('text-sm text-gray-800 break-words'), true)
eq('ikonet bliver', events.includes('shrink-0 mt-0.5'), true)
eq('klipper ikke', events.includes('truncate'), false)
eq('kost bliver ude', src.includes('Ingen kost, margin eller dækningsbidrag.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ncustomer-invoice-event-wrap-test OK')
process.exitCode = fail ? 1 : 0
