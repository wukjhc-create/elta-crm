/** Tilbudsoversigten siger naar hentningen fejler. Hitrate og maaned bliver. Koer: npx tsx scripts/monthly-offer-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard.ts', 'utf8')
const start = action.indexOf('export async function getMonthlyOfferStats')
const body = action.slice(start, start + 1800)
eq('fejl er ikke 0 kr', body.includes("error: 'Kunne ikke hente tilbudsoversigt'"), true)
eq('succes har error null', body.includes('error: null'), true)
eq('danske maaned bliver', body.includes('copenhagenParts(new Date()).date.slice(0, 7)'), true)
eq('ekskl moms bliver', action.includes('offerExVat(o)'), true)

const view = fs.readFileSync('src/components/modules/dashboard/monthly-offer-chart.tsx', 'utf8')
eq('fejlen saetter ikke tallene', view.indexOf('if (data.error)') < view.indexOf('setStats(data)'), true)
eq('foerste fejl bliver', view.includes('Kunne ikke hente tilbudsoversigt. Genindlæs siden.'), true)
eq('seneste tal bliver', view.includes('Kunne ikke opdatere tilbudsoversigten. Tallene er de seneste.'), true)
eq('hitrate bliver', view.includes('stats.acceptedCount / (stats.sentCount + stats.acceptedCount)'), true)
eq('koebenhavn bliver', view.includes("timeZone: 'Europe/Copenhagen'"), true)

console.log(fail ? `\n${fail} fejl` : '\nmonthly-offer-load-test OK')
process.exitCode = fail ? 1 : 0
