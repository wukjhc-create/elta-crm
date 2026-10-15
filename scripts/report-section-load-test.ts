/** Topkunder og sagsrentabilitet siger naar hentningen fejler. Tomme tekster, kost og DB bliver. Koer: npx tsx scripts/report-section-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('kunder siger fejl', src.includes('data-testid="report-customers-load-error"') && src.includes('Det tælles ikke som ingen tilbud.'), true)
eq('sager siger fejl', src.includes('data-testid="report-cases-load-error"') && src.includes('Det tælles ikke som ingen sager.'), true)
eq('tom kundeliste bliver', src.includes('Ingen tilbud ud over kladder med en kunde endnu.'), true)
eq('tom sagsliste bliver', src.includes('Ingen sager i overblikket endnu. Opret en sag fra kunden, så den vises her.'), true)
eq('kunder faar fejlen', src.includes('<TopCustomersTable data={customers} error={customersError} />'), true)
eq('sager faar fejlen', src.includes('<ProjectTable data={projects} error={projectsError} />'), true)
eq('kendt db bliver', src.includes('formatCurrency(p.realized_db)'), true)
eq('afvigelse bliver', src.includes('data-testid="report-case-deviation"'), true)
eq('kost kraever stadig aaben', src.includes('{costOpen && ('), true)
eq('teamfejlen bliver', src.includes('data-testid="report-team-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-section-load-test OK')
process.exitCode = fail ? 1 : 0
