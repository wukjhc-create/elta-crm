/** Regnskabs-widgeten siger naar e-conomic-tjekket eller en optaelling fejler. Et aegte ikke-opsat svar og et aegte 0 bliver. Koer: npx tsx scripts/accounting-health-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/services/accounting-health.ts', 'utf8')
const start = src.indexOf('export async function computeAccountingHealthSummary')
const fn = src.slice(start)
eq('funktion fundet', start > 0, true)
eq('tjek-fejl', fn.includes("integrationError = 'Kunne ikke tjekke e-conomic'"), true)
eq('aegte klar bliver', fn.includes('integrationReady = isEconomicReady(await getEconomicSettings())'), true)
eq('ventende fejl', fn.includes("notExportedError = 'Kunne ikke tælle ventende fakturaer'"), true)
eq('eksport fejl', fn.includes("exportedError = exported7.failed || exported30.failed ? 'Kunne ikke tælle eksporterede fakturaer' : null"), true)
eq('fejl-taelling', fn.includes("failedError = 'Kunne ikke tælle fejlede eksporter'"), true)
eq('aegte nul bliver', fn.includes('else notExported = count ?? 0'), true)

const view = fs.readFileSync('src/components/modules/dashboard/accounting-health-widget.tsx', 'utf8')
eq('tjek-banner', view.includes('data-testid="accounting-health-ready-error"') && view.includes('Det tælles ikke som at e-conomic mangler.'), true)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat endnu.') && view.includes('!data.integration_error && !data.integration_ready'), true)
eq('taelle-banner', view.includes('data-testid="accounting-health-counts-error"') && view.includes('Det tælles ikke som 0.'), true)
eq('ventende tekst', view.includes('data-testid="accounting-health-waiting-error"'), true)
eq('groen kun uden fejl', view.includes('&& !countsFailed') && view.includes('data.failed_count === 0') && view.includes('data.not_exported_count === 0'), true)
eq('groen tekst bliver', view.includes('Alt eksporteret — ingen fejl eller ventende fakturaer.'), true)
eq('taeller skjules', view.includes("data.failed_error ? '—' : data.failed_count") && view.includes("data.not_exported_error ? '—' : data.not_exported_count"), true)
eq('eksporttal bliver', view.includes('data.exported_7d'), true)

console.log(fail ? `\n${fail} fejl` : '\naccounting-health-load-test OK')
process.exitCode = fail ? 1 : 0
