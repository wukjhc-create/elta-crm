/** Tilbudssogning siger naar kunderne ikke kan laeses. Et aegte tomt match bliver. Koer: npx tsx scripts/offer-search-customer-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke søge i kunder. Det tælles ikke som ingen tilbud.'
const action = fs.readFileSync('src/lib/actions/offers.ts', 'utf8')
const start = action.indexOf('export async function getOffers')
const end = action.indexOf('export async function getOffer(')
const fn = start > 0 && end > start ? action.slice(start, end) : ''
if (!fn) {
  const alt = action.indexOf('export async function getOffer')
  eq('funktion findes', start > 0 && alt > start, true)
}
const body = fn || action.slice(start, start + 8000)
eq('funktion findes', start > 0 && body.includes('customerSearchError'), true)
eq('kundesogning siger fejl', body.includes('if (customerSearchError)') && body.includes(msg), true)
eq('fejlen kommer foer filtret', body.indexOf('if (customerSearchError)') < body.indexOf('orParts.push(`customer_id.in.'), true)
eq('aegte tomt match bliver', body.includes('if (matchingCustomers && matchingCustomers.length > 0)'), true)
eq('titelsoegning bliver', body.includes('title.ilike.') && body.includes('offer_number.ilike.'), true)

const page = fs.readFileSync('src/app/dashboard/offers/page.tsx', 'utf8')
eq('siden viser fejlen', page.includes('data-testid="offers-load-error"') && page.includes('offersResult.error'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-search-customer-test OK')
process.exitCode = fail ? 1 : 0
