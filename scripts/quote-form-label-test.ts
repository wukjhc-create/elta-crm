/** Tilbud fra mail kobler felterne. Priser og afsendelse bliver. Koer: npx tsx scripts/quote-form-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/quote-form-dialog.tsx', 'utf8')

const ids = [
  'mail-quote-company',
  'mail-quote-contact',
  'mail-quote-email',
  'mail-quote-phone',
  'mail-quote-address',
  'mail-quote-postal',
  'mail-quote-city',
  'mail-quote-title',
  'mail-quote-description',
  'mail-quote-notes',
  'mail-quote-validity',
  'mail-quote-tax',
  'mail-quote-discount',
  'mail-quote-sender',
  'mail-quote-kwp',
  'mail-quote-kwh',
  'mail-quote-panel',
  'mail-quote-inverter',
  'mail-quote-battery',
  'mail-quote-roof',
  'mail-quote-savings',
]

for (const id of ids) {
  eq(`${id} er koblet`, src.includes(`htmlFor="${id}"`) && src.includes(`id="${id}"`), true)
}

eq('kunde stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-4'), true)
eq('gyldighed stables', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-4'), true)
eq('gyldighedsfallback bliver', src.includes('parseInt(e.target.value) || 30'), true)
eq('momsfallback bliver', src.includes('setTaxPercentage(parseFloat(e.target.value) || 0)'), true)
eq('rabatfallback bliver', src.includes('setDiscountPercentage(parseFloat(e.target.value) || 0)'), true)
eq('besparelse bliver valgfri', src.includes('estimatedSavingsPerYear: parseFloat(e.target.value) || undefined'), true)
eq('luk bliver', src.includes('aria-label="Luk"'), true)
eq('afsendertekst bliver', src.includes('Email sendes som'), true)

console.log(fail ? `\n${fail} fejl` : '\nquote-form-label-test OK')
process.exitCode = fail ? 1 : 0
