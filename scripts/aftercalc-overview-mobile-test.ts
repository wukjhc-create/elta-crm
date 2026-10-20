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
eq('kunde kan krympe', mobile.includes('break-words min-w-0" data-testid="aftercalc-mobile-customer">{r.customer_name'), true)
eq('ansvarlig kan krympe', mobile.includes('break-words min-w-0" data-testid="aftercalc-mobile-assignee">Ansvarlig:'), true)
eq('advarsel ombrydes', mobile.includes('text-xs text-amber-900 break-words'), true)
eq('kortet viser omsætning og db-afvigelse', mobile.includes('quoted_revenue') && mobile.includes('actual_revenue') && mobile.includes('varianceText'), true)
eq('advarsel vises som tekst, ikke kun titel', mobile.includes('DATA_QUALITY_LABELS'), true)
eq('række-testid ligger ikke på kortet', mobile.includes('data-testid="aftercalc-overview-row"'), false)
eq('desktop-rækken beholder testid og datakvalitet', src.includes('data-testid="aftercalc-overview-row"') && src.includes('data-quality={r.data_quality}'), true)
eq('desktop-titel ombrydes', src.includes('text-[11px] text-gray-500 break-words max-w-[16rem] min-w-0">{r.title}'), true)
eq('desktop-titel klippes ikke', src.includes('truncate max-w-[16rem]'), false)
const table = src.slice(tableStart)
eq('desktop-advarsel kan krympe', table.includes('text-[11px] text-amber-900 break-words max-w-[12rem] min-w-0'), true)
eq('desktop-titel-attribut bliver', table.includes('title={r.warning_codes.map'), true)
eq('sagsnummer ombrydes', mobile.includes('hover:underline break-words') && table.includes('hover:underline break-words'), true)
eq('filtre stables paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm'), true)
eq('filtre kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm break-words min-w-0'), true)
eq('dato kan krympe', src.includes('type="date"') && src.includes('mt-0.5 w-full break-words min-w-0 max-w-full rounded border border-gray-300 px-2 py-1'), true)
eq('datofiltre siger fra og til', src.includes('Fra dato') && src.includes('Til dato'), true)
eq('fra-vaerdi bliver', src.includes("value={filters.from ?? ''}"), true)
eq('til-vaerdi bliver', src.includes("value={filters.to ?? ''}"), true)
eq('vinduet er ikke udvidet her', src.includes('AFTERCALC_CASE_WINDOW') === false, true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-overview-mobile-test OK')
process.exitCode = fail ? 1 : 0
