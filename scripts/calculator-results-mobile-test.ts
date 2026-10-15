/** Kalkulatorens noegletal stables paa mobil. Beloeeb og kost-gate bliver. Koer: npx tsx scripts/calculator-results-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/calculator/results-panel.tsx', 'utf8')

eq('noegletal stables', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-3'), true)
eq('anlaeg stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-4'), true)
eq('beloebsraekker ombrydes', src.split('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5').length - 1 === 17, true)
eq('kost skjules', src.includes('{showInternal && (<>'), true)
eq('arbejdslon bliver', src.includes('formatCurrency(results.laborCost)'), true)
eq('aarlig besparelse bliver', src.includes('formatCurrency(results.annualSavings)'), true)
eq('moms bliver', src.includes('Moms (25%)'), true)
eq('tilbagebetaling bliver', src.includes('Math.min((results.paybackYears / 25) * 100, 100)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalculator-results-mobile-test OK')
process.exitCode = fail ? 1 : 0
