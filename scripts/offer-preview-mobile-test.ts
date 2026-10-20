/** Tilbudsforhaandsvisningens totaler kan laeses paa mobil. Beloebene bliver. Koer: npx tsx scripts/offer-preview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
eq('forhaandsvisning findes', src.includes('id="offer-pdf-content"'), true)
eq('polstring giver plads', src.includes('id="offer-pdf-content" className="max-w-4xl mx-auto p-4 sm:p-8 bg-white min-h-screen"'), true)
eq('hovedet ombrydes', src.includes('flex flex-wrap justify-between items-start gap-4 mb-8'), true)
eq('mail ombrydes', src.includes('className="break-all">{offer.customer.email}'), true)
eq('totaler bruger bredden', src.includes('w-full sm:w-64 space-y-2'), true)
eq('subtotal bliver', src.includes('formatCurrency(offer.total_amount, currency, 2)'), true)
eq('rabat bliver', src.includes('formatCurrency(offer.discount_amount, currency, 2)'), true)
eq('moms bliver', src.includes('formatCurrency(offer.tax_amount, currency, 2)'), true)
eq('total bliver', src.includes('formatCurrency(offer.final_amount, currency, 2)'), true)
eq('linjekort bliver', src.includes('data-testid="offer-lines-mobile"'), true)
eq('modtager ombrydes', src.includes('font-medium text-primary hover:underline break-words') && src.includes('text-sm text-gray-500 break-all'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-preview-mobile-test OK')
process.exitCode = fail ? 1 : 0
