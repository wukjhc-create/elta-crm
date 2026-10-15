/** Kundelink, tilbuds-parter, leveringskunde og opret-tilbud har et navn. Soegning og valg bliver. Koer: npx tsx scripts/customer-search-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const read = (p: string) => fs.readFileSync(p, 'utf8')
const link = read('src/components/mail/customer-link-dialog.tsx')
const parties = read('src/components/modules/offers/edit-offer-parties-dialog.tsx')
const site = read('src/components/modules/orders/edit-site-info-dialog.tsx')
const offer = read('src/components/modules/kalkia/CreateOfferModal.tsx')

eq('mail har et navn', link.includes('aria-label="Søg kunde til mailen"') && link.includes('placeholder="Søg firmanavn, kundenr, email, kontakt..."'), true)
eq('mailfejl bliver', link.includes('Det tælles ikke som ingen kunder.'), true)
eq('tilbud har et navn', parties.includes('aria-label="Søg kunde til tilbuddet"') && parties.includes('placeholder="Søg firmanavn, kundenr, email…"'), true)
eq('levering har et navn', site.includes('aria-label="Søg leveringskunde"') && site.includes('placeholder="Søg firmanavn, kundenr, email..."'), true)
eq('kalkulation har et navn', offer.includes('aria-label="Søg kunde til kalkulationen"') && offer.includes('placeholder="Søg efter kunde..."'), true)
eq('kalkulationsfejl bliver', offer.includes('Det tælles ikke som ingen kunder.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-search-label-test OK')
process.exitCode = fail ? 1 : 0
