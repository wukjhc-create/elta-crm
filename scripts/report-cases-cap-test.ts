/** Sagsrentabilitet siger naar listen er klippet ved 15. Tallene bliver. Koer: npx tsx scripts/report-cases-cap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('loftet bliver 15', src.split('rows.slice(0, 15)').length - 1 === 2, true)
eq('loftet siges', src.includes('data-testid="report-cases-capped"') && src.includes('Viser 15 af {rows.length} sager. De øvrige {rows.length - 15} er ikke med i listen.'), true)
eq('kun naar der er flere', src.includes('rows.length > 15 &&'), true)
eq('tom liste bliver', src.includes('Ingen sager i overblikket endnu. Opret en sag fra kunden, så den vises her.'), true)
eq('fejl bliver', src.includes('Kunne ikke hente sagsrentabilitet. Det tælles ikke som ingen sager.'), true)
eq('afvigelse bliver', src.includes("'Kan ikke beregnes'"), true)
eq('budget-gate bliver', src.includes('p.budget ? formatCurrency(p.budget)'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-cases-cap-test OK')
process.exitCode = fail ? 1 : 0
