/** Tilbud: gyldig-til kan krympe. Rabat og moms bliver. Koer: npx tsx scripts/offer-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/offers/offer-form.tsx', 'utf8')
eq('gitter kan krympe', src.includes('grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0'), true)
eq('dato kan krympe', src.includes('id="valid_until"') && src.includes('type="date"') && src.includes('w-full min-w-0 max-w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'), true)
eq('gyldig til bliver', src.includes("register('valid_until')"), true)
eq('rabat bliver', src.includes("register('discount_percentage', { valueAsNumber: true })"), true)
eq('moms bliver', src.includes("register('tax_percentage', { valueAsNumber: true })") && src.includes('max="100"'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
