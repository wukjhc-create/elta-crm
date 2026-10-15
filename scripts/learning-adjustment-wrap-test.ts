/** Laeringsloggens vaerdier ombrydes. old_value, new_value og koebenhavn-datoen bliver. Koer: npx tsx scripts/learning-adjustment-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/settings/learning/learning-client.tsx', 'utf8')
const start = src.indexOf('recent_adjustments.map')
const end = src.indexOf('toLocaleDateString', start)
const row = src.slice(start, end)
eq('raekken findes', start > 0 && end > start, true)
eq('vaerdi kan krympe', row.includes('text-sm text-right min-w-0'), true)
eq('gammel ombrydes', row.includes('line-through break-words">{adj.old_value}'), true)
eq('ny ombrydes', row.includes('font-medium text-gray-900 break-words">{adj.new_value}'), true)
eq('ikke shrink-0', row.includes('text-right shrink-0'), false)
eq('aarsag ombrydes', row.includes('text-xs text-gray-500 break-words'), true)
eq('raekken ombrydes', src.includes('flex flex-wrap items-start gap-3 p-3 border rounded-lg'), true)
eq('datoen bliver', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short' })"), true)
eq('konfidens bliver', src.includes('cal.confidence < 0.3'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nlearning-adjustment-wrap-test OK')
process.exitCode = fail ? 1 : 0
