/** Tilbuddets advarsler og linje-knapper ombrydes. 0 kr-reglen er den samme. Koer: npx tsx scripts/offer-warning-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const costStart = src.indexOf('data-testid="offer-missing-cost-banner"')
const cost = src.slice(costStart - 200, src.indexOf('data-testid="offer-fill-cost"', costStart) + 80)
const lowStart = src.indexOf('data-testid="offer-lowdb-banner"')
const low = src.slice(lowStart - 120, lowStart + 900)

eq('manglende kost ombrydes', cost.includes('flex flex-wrap items-center justify-between gap-3') && cost.includes('break-words min-w-[12rem] flex-1'), true)
eq('manglende kost taelles som 0', src.includes('uden kostpris — tælles som 0 kr, så DB er overvurderet.'), true)
eq('udfyld kost bliver', src.includes('Udfyld kost') && src.includes('data-testid="offer-fill-cost"'), true)
eq('kostbanneret kraever stadig showFinancials', src.includes('showFinancials && offerDB.linesWithoutCost > 0'), true)
eq('lav db ombrydes', low.includes('break-words') && low.includes('min-w-0'), true)
eq('lav db siger stadig 0 kr', low.includes('tæller som 0 kr'), true)
eq('linjeknapper ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2 mb-4') && src.includes('Fra pakke'), true)
eq('optimering ombryder beskrivelse', src.includes('break-words min-w-0">{c.description}'), true)
eq('optimering kan lukkes', src.includes('aria-label="Luk prisoptimering"'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-warning-mobile-test OK')
process.exitCode = fail ? 1 : 0
