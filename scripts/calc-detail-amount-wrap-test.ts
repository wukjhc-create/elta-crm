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

const row = (label: string) => {
  const i = block.indexOf(label)
  const div = block.lastIndexOf('<div', i)
  return block.slice(div, block.indexOf('</div>', i))
}
const tilstand = row('>Tilstand<')
const type = row('>Type<')
const status = row('>Status<')
const markup = row('>Materialemarkup<')
eq('tilstand ombrydes', tilstand.includes('flex-wrap') && tilstand.includes('break-words') && tilstand.includes('CALCULATION_MODE_LABELS'), true)
eq('type ombrydes', type.includes('flex-wrap') && type.includes('break-words') && type.includes('CALCULATION_TYPE_LABELS'), true)
eq('skabelon ombrydes', status.includes('flex-wrap') && status.includes('break-words') && status.includes('Skabelon'), true)
eq('markup ombrydes', markup.includes('flex-wrap') && markup.includes('min-w-0 break-words') && markup.includes('calculation.materials_markup_percentage || CALC_DEFAULTS.MARGINS.MATERIALS'), true)
eq('tilstand er ikke fast', tilstand.includes('flex justify-between"'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\ncalc-detail-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
