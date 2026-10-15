/** Foerste hentning af arbejdsordrer siger naar den fejler. Tom plan og kost bliver. Koer: npx tsx scripts/planning-load-view-test.ts */
import fs from 'fs'
import { planningLoadView } from '../src/lib/planning/planning-load-view'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

eq('venter uden fejl', planningLoadView(false, null), 'loading')
eq('foerste fejl er ikke tom', planningLoadView(false, 'Kunne ikke hente arbejdsordrer'), 'failed')
eq('senere fejl beholder listen', planningLoadView(true, 'Kunne ikke hente arbejdsordrer'), 'ready')
eq('klar uden fejl', planningLoadView(true, null), 'ready')

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
eq('bruger visningen', src.includes('planningLoadView(workOrders !== null, error)'), true)
eq('fejltekst', src.includes('Det tælles ikke som en tom plan.'), true)
eq('hentetekst bliver', src.includes('Henter planlagte arbejdsordrer…'), true)
eq('tom plan bliver', src.includes('Ingen arbejdsordrer planlagt endnu'), true)
eq('kastet fejl siges', src.includes("setError('Kunne ikke hente arbejdsordrer')"), true)
eq('kostformlen bliver', src.includes('Number(l.hours) * Number(l.employee.hourly_rate)'), true)
eq('opdatering bliver', src.includes('updateWorkOrderPlanning(woId, patch)'), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-load-view-test OK')
process.exitCode = fail ? 1 : 0
