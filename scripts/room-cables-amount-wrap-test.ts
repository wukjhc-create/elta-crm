/** Rumkalkulatorens kabelbeloeb ombrydes. formatCurrency bliver. Koer: npx tsx scripts/room-cables-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
const start = src.indexOf('data-testid="room-cables-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('type ombrydes', mobile.includes('break-words font-medium text-gray-900">{ct.type}'), true)
eq('linjetotal ombrydes', mobile.includes('break-words">{formatCurrency(ct.total_cost)}'), true)
eq('meterlinje ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words'), true)
eq('samlet pris ombrydes', mobile.includes('break-words">{formatCurrency(estimate.cable_summary.total_cable_cost)}'), true)
eq('meter bliver', mobile.includes('ct.total_meters.toFixed(1)'), true)
eq('pris pr meter bliver', mobile.includes('formatCurrency(ct.estimated_cost_per_meter)'), true)
eq('samlet meter bliver', mobile.includes('estimate.cable_summary.total_meters.toFixed(1)'), true)
eq('ingen shrink-0', mobile.includes('shrink-0'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nroom-cables-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
