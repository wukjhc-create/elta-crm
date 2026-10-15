/** Tilbudsanalysen beregner ikke DB naar tilbuddet ikke kan laeses. Koer: npx tsx scripts/offer-profit-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/profit.ts', 'utf8')
const start = src.indexOf('export async function getOfferProfitAnalysis')
const end = src.indexOf('export async function getCheaperAlternativesForOffer')
const body = src.slice(start, end)
eq('funktion findes', body.length > 80, true)
eq('laesefejl foer ikke-fundet', body.indexOf('if (offerErr)') < body.indexOf("error: 'Tilbud ikke fundet'"), true)
eq('laesefejl foer beregning', body.indexOf('DB er ikke beregnet.') < body.indexOf('analyzeOfferProfit('), true)
eq('ikke-fundet bliver', body.includes("error: 'Tilbud ikke fundet'"), true)
eq('kostlinje bliver', body.includes('Number(i.cost_price ?? 0) > 0 ? Number(i.cost_price)'), true)
eq('timekost-fejl bliver', body.includes('if (hourly.failed)'), true)
eq('db-maal bliver', body.includes('if (minimumDb.failed || targetDb.failed)'), true)

const card = fs.readFileSync('src/components/modules/offers/offer-profit-card.tsx', 'utf8')
eq('kortet viser fejlen', card.includes('data-testid="offer-profit-load-error"') && card.includes('setError(r.error ?? \'Kunne ikke beregne lønsomhed\')'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-profit-read-test OK')
process.exitCode = fail ? 1 : 0
