/** Tilbud til sag ombryder nummer og felter. Beløb og fakturering er de samme. Kør: npx tsx scripts/offer-case-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-to-case-card.tsx', 'utf8')

eq('sagsnummer ombrydes', src.includes('font-mono break-all">{linkedCase.case_number}'), true)
eq('feltvaerdi ombrydes', src.includes('text-sm text-gray-800 break-words'), true)
eq('ingen truncate', src.includes('truncate'), false)
eq('fakturering bliver', src.includes('data-testid="offer-invoice-on-case"'), true)
eq('tilbudssum bliver', src.includes('kr(preview.offer_sum, preview.currency)'), true)
eq('opret sag bliver', src.includes('Opret sag fra tilbud'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-case-wrap-test OK')
process.exitCode = fail ? 1 : 0
