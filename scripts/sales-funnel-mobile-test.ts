/** Salgstragt paa smaa skaerme. U-raekken bliver i tabellen. Koer: npx tsx scripts/sales-funnel-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')
const start = src.indexOf('data-testid="sales-funnel-mobile"')
const end = src.indexOf('hidden md:block overflow-x-auto')
const mobile = src.slice(start, end)

eq('mobil-liste findes', start > 0, true)
eq('tabellen er skjult under md', end > start, true)
eq('kortet viser kunder, sendt og faktureret', mobile.includes('new_customers') && mobile.includes('offers_sent') && mobile.includes('invoiced_ex_vat'), true)
eq('U-raekke ligger ikke paa kortet', mobile.includes('funnel-row'), false)
eq('tabellen har stadig én raekke-testid', src.split('data-testid="funnel-row"').length === 2, true)
eq('i alt staar paa kortet', mobile.includes('I alt') && mobile.includes('t.accepted_value'), true)

console.log(fail ? `\n${fail} fejl` : '\nsales-funnel-mobile-test OK')
process.exitCode = fail ? 1 : 0
