/** Tilbuddets lead-kontakt ombrydes. Linket bliver. Koer: npx tsx scripts/offer-lead-contact-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const at = src.indexOf('{offer.lead.contact_person}')
const around = src.slice(Math.max(0, at - 120), at)
eq('kontakt findes', at > 0, true)
eq('kontakt ombrydes', around.includes('text-sm text-gray-500 break-words'), true)
eq('lead-link bliver', src.includes('href={`/dashboard/leads/${offer.lead.id}`}'), true)
eq('lead-navn ombrydes', src.includes('font-medium text-primary hover:underline break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-lead-contact-wrap-test OK')
process.exitCode = fail ? 1 : 0
