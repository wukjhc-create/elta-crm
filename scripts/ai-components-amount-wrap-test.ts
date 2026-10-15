/** AI-projektets komponentbeloeb ombrydes. formatCurrency bliver. Koer: npx tsx scripts/ai-components-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const start = src.indexOf('data-testid="ai-components-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('total ombrydes', mobile.includes('break-words">{formatCurrency(comp.total)}'), true)
eq('enhedslinje ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words'), true)
eq('navn bliver', mobile.includes('break-words font-medium text-gray-900">{comp.name}'), true)
eq('antal bliver', mobile.includes('{comp.quantity} {comp.unit}'), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(comp.unit_price)'), true)
eq('ingen shrink-0', mobile.includes('shrink-0'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nai-components-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
