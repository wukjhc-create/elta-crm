/** AI-projektets komponenter kan laeses paa mobil. Priserne bliver. Koer: npx tsx scripts/ai-components-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const start = src.indexOf('data-testid="ai-components-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('navn ombrydes', mobile.includes('break-words font-medium text-gray-900">{comp.name}'), true)
eq('antal bliver', mobile.includes('{comp.quantity} {comp.unit}'), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(comp.unit_price)'), true)
eq('total bliver', mobile.includes('formatCurrency(comp.total)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block border rounded-lg overflow-hidden'), true)
eq('overskrift bliver', src.includes('Komponenter'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-components-mobile-test OK')
process.exitCode = fail ? 1 : 0
