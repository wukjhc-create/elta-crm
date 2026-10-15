/** Rapportens topkunder ombryder omsaetning. formatCurrency og acceptprocenten bliver. Koer: npx tsx scripts/report-customers-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
const start = src.indexOf('data-testid="report-customers-mobile"')
const end = src.indexOf('hidden md:block overflow-x-auto', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('omsaetning ombrydes', mobile.includes('tabular-nums font-medium text-gray-900 break-words'), true)
eq('omsaetning bliver', mobile.includes('formatCurrency(c.total_revenue)'), true)
eq('accept bliver', mobile.includes('c.acceptance_rate.toFixed(0)'), true)
eq('kunde ombrydes', mobile.includes('font-medium text-gray-900 break-words">{c.customer_name}'), true)
eq('tilbud bliver', mobile.includes('c.total_offers} tilbud'), true)
eq('tom tekst bliver', src.includes('Ingen tilbud ud over kladder med en kunde endnu.'), true)
eq('fejl bliver', src.includes('Det tælles ikke som ingen tilbud.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nreport-customers-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
