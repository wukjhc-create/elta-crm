/** Efterkalkulationsoversigten på små skærme. Kør: npx tsx scripts/aftercalc-overview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="aftercalc-overview-mobile"')
const tableStart = src.indexOf('hidden md:block overflow-x-auto')
const mobile = src.slice(mobileStart, tableStart)

eq('mobil-liste findes', mobileStart > 0, true)
eq('tabellen er skjult under md', tableStart > mobileStart, true)
eq('kortet viser sag, kunde og ansvarlig', mobile.includes('case_number') && mobile.includes('customer_name') && mobile.includes('assignee_name'), true)
eq('kunde ombrydes', mobile.includes('text-sm text-gray-800 break-words">{r.customer_name'), true)
eq('ansvarlig ombrydes', mobile.includes('break-words">Ansvarlig:'), true)
eq('advarsel ombrydes', mobile.includes('text-xs text-amber-900 break-words'), true)
eq('kortet viser omsætning og db-afvigelse', mobile.includes('quoted_revenue') && mobile.includes('actual_revenue') && mobile.includes('varianceText'), true)
eq('advarsel vises som tekst, ikke kun titel', mobile.includes('DATA_QUALITY_LABELS'), true)
eq('række-testid ligger ikke på kortet', mobile.includes('data-testid="aftercalc-overview-row"'), false)
eq('desktop-rækken beholder testid og datakvalitet', src.includes('data-testid="aftercalc-overview-row"') && src.includes('data-quality={r.data_quality}'), true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-overview-mobile-test OK')
process.exitCode = fail ? 1 : 0
