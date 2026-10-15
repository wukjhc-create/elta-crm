/** AI-projektets prisopbygning ombryder beloeb. formatCurrency og timeformlerne bliver. Koer: npx tsx scripts/ai-price-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const start = src.indexOf('>Prisopbygning</h4>')
const end = src.indexOf('>Komponenter</h4>', start)
const block = src.slice(start, end)
eq('blokken findes', start > 0 && end > start, true)
eq('materiale ombrydes', block.includes('break-words">{formatCurrency(result.calculation.price.material_cost)}'), true)
eq('loen ombrydes', block.includes('break-words">{formatCurrency(result.calculation.price.labor_cost)}'), true)
eq('subtotal ombrydes', block.includes('break-words">{formatCurrency(result.calculation.price.subtotal)}'), true)
eq('margin ombrydes', block.includes('break-words">{formatCurrency(result.calculation.price.margin_amount)}'), true)
eq('buffer ombrydes', block.includes('break-words">{formatCurrency(result.calculation.price.risk_buffer_amount)}'), true)
eq('total ombrydes', block.includes('text-green-600 break-words">{formatCurrency(result.calculation.price.total_price)}'), true)
eq('timer bliver', block.includes('result.calculation.time.total_hours.toFixed(1)'), true)
eq('sats bliver', block.includes('result.calculation.price.hourly_rate'), true)
eq('marginprocent bliver', block.includes('{result.calculation.price.margin_percentage}%'), true)
eq('bufferprocent bliver', block.includes('{result.calculation.price.risk_buffer_percentage}%'), true)
eq('basistid bliver', block.includes('result.calculation.time.base_hours.toFixed(1)'), true)
eq('faktorer bliver', block.includes('result.calculation.time.complexity_multiplier') && block.includes('result.calculation.time.size_multiplier') && block.includes('result.calculation.time.accessibility_multiplier'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nai-price-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
