/** Tilbuddets kalkulationsvaelger siger naar listen ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/offer-calculations-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('const handleOpenCalculationPicker')
const fn = src.slice(start, src.indexOf('const handleAddProduct', start))
eq('funktionen findes', start > 0, true)
eq('success saetter listen', fn.includes('setCalculations(result.data)'), true)
eq('success rydder fejl', fn.includes('setCalculationsError(null)'), true)
eq('fejl teksten', fn.includes("setCalculationsError(result.error || 'Kunne ikke hente kalkulationer')"), true)
eq('fejl toemmer ikke listen', fn.includes('setCalculations([])') === false, true)
eq('import bliver', src.includes('importCalculationToOffer(offer.id, calculationId)'), true)
eq('beloeb bliver', src.includes('formatCurrency(calc.final_amount, currency, 2)'), true)
eq('banner', src.includes('data-testid="offer-calculations-load-error"') && src.includes('Det tælles ikke som ingen kalkulationer.'), true)
eq('allerede hentede bliver', src.includes('Allerede hentede kalkulationer bliver.'), true)
eq('aegte tom kraever ingen fejl', src.includes('!calculationsError && calculations.length === 0'), true)
eq('aegte tom bliver', src.includes('Ingen kalkulationer fundet'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-calculations-load-test OK')
process.exitCode = fail ? 1 : 0
