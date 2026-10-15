/** Loensomhed siger naar timekost eller DB-maal ikke kan laeses. Tallene og mangler-teksten bliver. Koer: npx tsx scripts/offer-profit-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/profit.ts', 'utf8')
const fn = action.slice(action.indexOf('async function resolveHourlyCost'), action.indexOf('export async function getCheaperAlternativesForOffer'))
eq('funktion findes', fn.length > 80, true)
eq('timekost-fejl', fn.includes("source: 'Kunne ikke læse timekost. Det tælles ikke som at den ikke er sat.'"), true)
eq('fejl foer ikke sat', fn.indexOf('if (csError)') < fn.indexOf("source: 'firma-standard ikke sat'"), true)
eq('gns bliver', fn.includes('reel timekost ikke sat'), true)
eq('db-maal fejl', fn.includes("error: 'Kunne ikke læse DB-mål. Det tælles ikke som at målet ikke er sat.'"), true)
eq('maal foer beregning', fn.indexOf('if (minimumDb.failed || targetDb.failed)') < fn.indexOf('analyzeOfferProfit('), true)
eq('timekost foer beregning', fn.indexOf('if (hourly.failed)') < fn.indexOf('analyzeOfferProfit('), true)
eq('kostlinje bliver', fn.includes('Number(i.cost_price ?? 0) > 0 ? Number(i.cost_price)'), true)

const card = fs.readFileSync('src/components/modules/offers/offer-profit-card.tsx', 'utf8')
eq('kort viser fejl', card.includes('data-testid="offer-profit-load-error"'), true)
eq('naeste skridt bliver', card.includes('kunne ikke hentes. Åbn tilbuddet igen.'), true)
eq('kilde bliver', card.includes('{data.hourlyCostSource}'), true)
const detail = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
eq('mangler-tekst bliver', detail.includes('uden kostpris — tælles som 0 kr, så DB er overvurderet.'), true)
const engine = fs.readFileSync('src/lib/profit/offer-analysis.ts', 'utf8')
eq('motoren bliver', engine.includes('linje(r) mangler kostpris'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-profit-load-test OK')
process.exitCode = fail ? 1 : 0
