/** Sagens øvrige omkostninger på små skærme. Kør: npx tsx scripts/other-costs-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-other-costs-tab.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="other-costs-mobile"')
const tableStart = src.indexOf('hidden md:block bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto')
const mobile = src.slice(mobileStart, tableStart)
const unitCost = mobile.indexOf('formatCurrency(r.unit_cost')
const db = mobile.indexOf('summary.contribution_margin')

eq('mobil-liste findes', mobileStart > 0, true)
eq('tabellen er skjult under md', tableStart > mobileStart, true)
eq('kortet viser beskrivelse, antal og salg', mobile.includes('r.description') && mobile.includes('r.quantity') && mobile.includes('r.total_sales_price'), true)
eq('kostpris paa kortet kraever showCost', unitCost > mobile.lastIndexOf('{showCost && (', unitCost) && mobile.lastIndexOf('{showCost && (', unitCost) > 0, true)
eq('foreloebig db paa kortet kraever showCost', db > mobile.lastIndexOf('{showCost && (', db) && mobile.lastIndexOf('{showCost && (', db) > 0, true)
eq('db-testid ligger ikke paa kortet', mobile.includes('other-costs-db-row'), false)
eq('desktop-foden beholder db-testid', src.includes('data-testid="other-costs-db-row"'), true)
eq('rediger og slet har samme etiketter', mobile.includes('aria-label="Rediger omkostning"') && mobile.includes('aria-label="Slet omkostning"'), true)

console.log(fail ? `\n${fail} fejl` : '\nother-costs-mobile-test OK')
process.exitCode = fail ? 1 : 0
