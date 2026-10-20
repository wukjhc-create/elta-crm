/** Sag siger naar tilbudslisten fejler. Tom liste og koblingen bliver. Koer: npx tsx scripts/order-offer-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const created = fs.readFileSync('src/app/dashboard/orders/new/new-order-form.tsx', 'utf8')
const edited = fs.readFileSync('src/app/dashboard/orders/[id]/edit/edit-order-form.tsx', 'utf8')

for (const [name, src] of [['ny', created], ['ret', edited]] as const) {
  eq(`${name} kast siges`, src.includes("setOfferLoadError('Kunne ikke hente tilbud')"), true)
  eq(`${name} ikke ingen tilbud`, src.includes('Det tælles ikke som ingen tilbud.'), true)
  eq(`${name} tom liste skjules`, src.includes('!offerLoadError && offers.length > 0'), true)
  eq(`${name} intet tilbud bliver`, src.includes('— Intet tilbud —'), true)
  eq(`${name} gamle tilbud ryddes`, src.includes('setOffers([])'), true)
}

eq('opret sag bliver', created.includes('createServiceCase({'), true)
eq('eksisterende kobling bliver', edited.includes('defaultValue={sag.source_offer_id ?? \'\''), true)

console.log(fail ? `\n${fail} fejl` : '\norder-offer-load-test OK')
process.exitCode = fail ? 1 : 0
