/** Rumkalkulatorens kabeloversigt kan laeses paa mobil. Priserne bliver. Koer: npx tsx scripts/room-cables-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
const start = src.indexOf('data-testid="room-cables-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('type ombrydes', mobile.includes('break-words font-medium text-gray-900">{ct.type}'), true)
eq('meter bliver', mobile.includes('ct.total_meters.toFixed(1)'), true)
eq('pris pr meter bliver', mobile.includes('formatCurrency(ct.estimated_cost_per_meter)'), true)
eq('linjetotal bliver', mobile.includes('formatCurrency(ct.total_cost)'), true)
eq('samlet meter bliver', mobile.includes('estimate.cable_summary.total_meters.toFixed(1)'), true)
eq('samlet pris bliver', mobile.includes('formatCurrency(estimate.cable_summary.total_cable_cost)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)

console.log(fail ? `\n${fail} fejl` : '\nroom-cables-mobile-test OK')
process.exitCode = fail ? 1 : 0
