/** Rumkalkulatorens tid- og materialesammendrag ombryder beloeb. formatCurrency bliver. Koer: npx tsx scripts/room-summary-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
const start = src.indexOf('{/* Time and Material Summary */}')
const end = src.indexOf('{/* Room Breakdown */}', start)
const block = src.slice(start, end)
eq('blokken findes', start > 0 && end > start, true)
eq('salg ombrydes', block.includes('break-words">{formatCurrency(estimate.total_labor_sale)}'), true)
eq('kost ombrydes', block.includes('break-words">{formatCurrency(estimate.total_labor_cost)}'), true)
eq('materiale ombrydes', block.includes('break-words">{formatCurrency(estimate.total_material_cost)}'), true)
eq('overhead ombrydes', block.includes('break-words">{formatCurrency(estimate.overhead_amount)}'), true)
eq('tavle ombrydes', block.includes('break-words">{formatCurrency(estimate.panel_requirements.estimated_panel_cost)}'), true)
eq('timer bliver', block.includes('estimate.total_labor_hours.toFixed(1)'), true)
eq('dage bliver', block.includes('Math.ceil(estimate.total_labor_hours / 8)'), true)
eq('kabel bliver', block.includes('Math.round(estimate.total_cable_meters)'), true)
eq('grupper bliver', block.includes('estimate.panel_requirements.total_groups_needed'), true)
eq('hpfi bliver', block.includes('estimate.panel_requirements.rcd_groups_needed'), true)
eq('raekken kan ombrydes', block.includes('flex flex-wrap justify-between gap-x-3 min-w-0'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nroom-summary-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
