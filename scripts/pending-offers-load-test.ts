/** Afventende tilbud siger naar hentningen fejler. Tom tekst og beloeb bliver. Koer: npx tsx scripts/pending-offers-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard.ts', 'utf8')
const start = action.indexOf('export async function getPendingOffers')
const next = action.indexOf('export async function getMonthlyOfferStats')
const body = action.slice(start, next === -1 ? start + 2200 : next)
eq('query-fejl er ikke en tom liste', body.includes("error: 'Kunne ikke hente afventende tilbud'"), true)
eq('rigtig tom liste har error null', body.includes('if (!data) return { offers: [], error: null }'), true)
eq('beloebsformlen bliver', body.includes('total_amount: offer.total_amount || 0'), true)
eq('sendt og set bliver', body.includes(".in('status', ['sent', 'viewed'])"), true)

const view = fs.readFileSync('src/components/modules/dashboard/pending-offers.tsx', 'utf8')
eq('kortet siger fejl', view.includes('data-testid="pending-offers-load-error"') && view.includes('Det tælles ikke som ingen tilbud.'), true)
eq('tom liste bliver', view.includes('Ingen afventende tilbud'), true)
eq('beloeb vises', view.includes('formatCurrency(offer.total_amount)'), true)
eq('samlet vaerdi bliver', view.includes('offers.reduce((sum, offer) => sum + offer.total_amount, 0)'), true)

const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('dashboardet sender fejlen', page.includes('loadError={pendingOffersResult.error}'), true)
eq('dashboardet sender listen', page.includes('offers={pendingOffersResult.offers}'), true)

console.log(fail ? `\n${fail} fejl` : '\npending-offers-load-test OK')
process.exitCode = fail ? 1 : 0
