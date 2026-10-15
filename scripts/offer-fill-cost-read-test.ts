/** Udfyld kost skriver ikke naar tilbuddet eller leverandoerkosten ikke kan laeses. Koer: npx tsx scripts/offer-fill-cost-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/profit.ts', 'utf8')
const start = src.indexOf('export async function fillMissingOfferLineCosts')
const body = src.slice(start)
eq('funktion findes', body.includes('fillMissingOfferLineCosts'), true)
eq('tilbudslaese kommer foer ikke-fundet', body.indexOf('if (offerErr)') < body.indexOf("error: 'Tilbud ikke fundet'"), true)
eq('tilbudslaese skriver ikke', body.indexOf('Ingen kostpris er udfyldt.') < body.indexOf('.update('), true)
eq('ikke-fundet bliver', body.includes("error: 'Tilbud ikke fundet'"), true)
eq('kun kladder bliver', body.includes("error: 'Kun kladder kan opdateres'"), true)
eq('leverandoerkost kommer foer skriv', body.indexOf('if (spErr)') < body.indexOf('.update('), true)
eq('leverandoerkost skriver ikke', body.includes('Kunne ikke hente leverandørkost. Ingen kostpris er udfyldt.'), true)
eq('kost skrives stadig kun som kostpris', body.includes('update({ cost_price: cost })'), true)
eq('timekost-kald bliver', body.includes('resolveHourlyCost(supabase)'), true)

const view = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
eq('bannerteksten bliver', view.includes('uden kostpris — tælles som 0 kr, så DB er overvurderet.'), true)
eq('knappen viser fejlen', view.includes("toast.error('Kunne ikke udfylde kost', res.error)"), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-fill-cost-read-test OK')
process.exitCode = fail ? 1 : 0
