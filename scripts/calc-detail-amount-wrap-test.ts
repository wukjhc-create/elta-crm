/** Kalkulationens timepris og kundenavn ombrydes. formatCurrency og fallback-satsen bliver. Koer: npx tsx scripts/calc-detail-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/calculations/[id]/calculation-detail-client.tsx', 'utf8')
const start = src.indexOf('>Information<')
const end = src.indexOf('Edit Calculation Dialog', start)
const block = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('timepris ombrydes', block.includes('break-words">{formatCurrency(calculation.default_hourly_rate || CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN)}'), true)
eq('fallback bliver', block.includes('calculation.default_hourly_rate || CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN'), true)
eq('kunde ombrydes', block.includes('break-words">{calculation.customer.company_name}'), true)
eq('intern visning bliver', block.includes("calculation.calculation_mode === 'electrician' && showInternalView"), true)
eq('markup bliver', block.includes('calculation.materials_markup_percentage || CALC_DEFAULTS.MARGINS.MATERIALS'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ncalc-detail-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
