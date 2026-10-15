/** Fakturaokonomiens forfald og haendelser ombryder beloeb. kr() og den tomme tekst bliver. Koer: npx tsx scripts/invoice-economy-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/dashboard/invoice-economy-section.tsx', 'utf8')
const dueStart = src.indexOf('overdue_top.map')
const dueEnd = src.indexOf('recent_events.map', dueStart)
const due = src.slice(dueStart, dueEnd)
const evStart = dueEnd
const evEnd = src.indexOf('Omkostningsfrit overblik', evStart)
const ev = src.slice(evStart, evEnd)

eq('forfald findes', dueStart > 0 && dueEnd > dueStart, true)
eq('haendelse findes', evStart > 0 && evEnd > evStart, true)
eq('forfald kan krympe', due.includes('text-right min-w-0'), true)
eq('forfald ombrydes', due.includes('tabular-nums break-words'), true)
eq('forfald er ikke shrink-0', due.includes('text-right shrink-0'), false)
eq('forfaldsbeloeb bliver', due.includes('kr(r.final_amount, r.currency)'), true)
eq('forfaldsdage bliver', due.includes('r.days_overdue} dage over'), true)
eq('haendelsesbeloeb ombrydes', ev.includes('text-gray-700 break-words min-w-0'), true)
eq('haendelsesbeloeb bliver', ev.includes('kr(e.amount_incl_vat)'), true)
eq('ikonet bliver', ev.includes('shrink-0 mt-0.5'), true)
eq('haendelsesbeloeb er ikke shrink-0', ev.includes('text-gray-700 shrink-0'), false)
eq('tom forfald bliver', src.includes('Der er ingen forfaldne fakturaer lige nu.'), true)
eq('tom haendelse bliver', src.includes('Ingen faktura-hændelser endnu.'), true)
eq('klipper ikke', src.includes('truncate'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\ninvoice-economy-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
