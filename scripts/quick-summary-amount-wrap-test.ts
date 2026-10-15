/** Hurtigkalkulationens beloeb ombrydes. formatCurrency og momsformlen bliver. Koer: npx tsx scripts/quick-summary-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/calculations/quick/quick-calculation-client.tsx', 'utf8')
const start = src.indexOf('>Opsummering</')
const end = src.indexOf('currentStep === 2', start)
const side = src.slice(start, end)
const finalStart = src.indexOf('Endelig oversigt', end)
const finalEnd = src.indexOf('Dækningsbidrag', finalStart)
const finalBlock = src.slice(finalStart, finalEnd + 400)
eq('opsummering findes', start > 0 && end > start, true)
eq('oversigt findes', finalStart > end, true)
eq('side materiale ombrydes', side.includes('break-words">{formatCurrency(totals.totalSalePrice)}'), true)
eq('side loen ombrydes', side.includes('break-words">{formatCurrency(laborCost)}'), true)
eq('side subtotal ombrydes', side.includes('break-words">{formatCurrency(grandTotal)}'), true)
eq('side db ombrydes', side.includes('break-words">{formatCurrency(dbAmount)}'), true)
eq('timer bliver', side.includes('laborHours.toFixed(1)'), true)
eq('sats bliver', side.includes('formatCurrency(hourlyRate)'), true)
eq('db procent bliver', side.includes('dbPercentage.toFixed(1)'), true)
eq('moms ombrydes', finalBlock.includes('break-words">{formatCurrency(grandTotal * (DEFAULT_TAX_RATE / 100))}'), true)
eq('inkl moms ombrydes', finalBlock.includes('break-words">{formatCurrency(grandTotal * (1 + DEFAULT_TAX_RATE / 100))}'), true)
eq('momsformel bliver', finalBlock.includes('grandTotal * (DEFAULT_TAX_RATE / 100)') && finalBlock.includes('grandTotal * (1 + DEFAULT_TAX_RATE / 100)'), true)
eq('komponentnavn ombrydes', src.includes('break-words">{comp.componentName}'), true)
eq('antal bliver', src.includes('× {comp.quantity}'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nquick-summary-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
