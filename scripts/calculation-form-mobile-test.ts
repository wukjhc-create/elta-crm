/** Kalkulationsfelter stables paa mobil. Procenter og standardvaerdier bliver. Koer: npx tsx scripts/calculation-form-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const form = fs.readFileSync('src/components/modules/calculations/calculation-form.tsx', 'utf8')
const row = fs.readFileSync('src/components/modules/calculations/calculation-row-form.tsx', 'utf8')

eq('formularens tre felter stables', form.split('grid grid-cols-1 sm:grid-cols-3 gap-4').length - 1 === 1, true)
eq('formularens par stables', form.split('grid grid-cols-1 sm:grid-cols-2 gap-4').length - 1 === 2, true)
eq('linjens tre felter stables', row.split('grid grid-cols-1 sm:grid-cols-3 gap-4').length - 1 === 2, true)
eq('linjens par stables', row.split('grid grid-cols-1 sm:grid-cols-2 gap-4').length - 1 === 2, true)
eq('avance bliver', form.includes('name="margin_percentage"') && form.includes('max="100"'), true)
eq('moms-standard bliver', form.includes('DEFAULT_TAX_RATE'), true)
eq('timepris-standard bliver', form.includes('CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN'), true)
eq('salgspris bliver', row.includes('name="sale_price"') && row.includes('setSalePrice'), true)
eq('kostpris bliver', row.includes('name="cost_price"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalculation-form-mobile-test OK')
process.exitCode = fail ? 1 : 0
