/** Betalingsposteringen kan ombrydes paa mobil. Belobet bliver. Koer: npx tsx scripts/payment-preview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/invoices/invoice-payment-economic-preview.tsx', 'utf8')
eq('linjen ombrydes', src.includes('flex flex-wrap justify-between gap-2') && src.includes('break-words">{data.entry.body.text}'), true)
eq('beloeb bliver', src.includes('data-testid="economic-payment-amount"') && src.includes('fmt(data.entry.body.amount)'), true)
eq('intet sendes', src.includes('Forhåndsvisning — intet sendes til e-conomic herfra.'), true)
eq('allerede ombrydes', src.includes('break-words rounded px-2 py-1 ring-1 bg-blue-50') && src.includes('Betalingen er allerede registreret i e-conomic — sendes ikke igen.'), true)

console.log(fail ? `\n${fail} fejl` : '\npayment-preview-mobile-test OK')
process.exitCode = fail ? 1 : 0
