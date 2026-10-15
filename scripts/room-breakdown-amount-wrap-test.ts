/** Rumopdelingens beloeb ombrydes. formatCurrency bliver. Koer: npx tsx scripts/room-breakdown-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
const start = src.indexOf('>Rum-opdeling</h4>')
const end = src.indexOf('estimate.risk_analysis', start)
const block = src.slice(start, end)
eq('blokken findes', start > 0 && end > start, true)
eq('materiale ombrydes', block.includes('text-gray-500 break-words') && block.includes('formatCurrency(room.total_material_cost)'), true)
eq('total ombrydes', block.includes('font-medium break-words">') && block.includes('formatCurrency(room.total_cost)'), true)
eq('navn ombrydes', block.includes('break-words">{room.room_name}'), true)
eq('timer bliver', block.includes('(room.total_time_seconds / 3600).toFixed(1)'), true)
eq('punkter bliver', block.includes('Object.values(room.points).reduce((s, v) => s + v, 0)'), true)
eq('raekken kan ombrydes', block.includes('flex flex-wrap gap-x-6 gap-y-1 text-sm min-w-0'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nroom-breakdown-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
