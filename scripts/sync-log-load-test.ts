/** Eksport-loggen siger naar listen, taellerne eller e-conomic-tjekket fejler. Et aegte tomt svar og et aegte ikke-opsat svar bliver. Koer: npx tsx scripts/sync-log-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/accounting.ts', 'utf8')
const start = action.indexOf('export async function listAccountingSyncLogAction')
const end = action.indexOf('export interface RetryExportResult')
const fn = action.slice(start, end)
eq('funktion fundet', start > 0 && end > start, true)
eq('tjek-fejl', fn.includes("integrationError = 'Kunne ikke tjekke e-conomic'"), true)
eq('aegte klar bliver', fn.includes('integrationReady = isEconomicReady(await getEconomicSettings())'), true)
eq('taelle-fejl', fn.includes("countsError = 'Kunne ikke tælle eksportforsøg'"), true)
const errStart = fn.indexOf('if (error) {')
const errEnd = fn.indexOf('const rows = logs')
const errBlock = fn.slice(errStart, errEnd)
eq('listefejl', errBlock.includes("message: 'Kunne ikke hente eksport-loggen'") && errBlock.includes('ok: false'), true)
eq('listefejl er ikke succes', errBlock.includes('ok: true'), false)

const view = fs.readFileSync('src/app/dashboard/settings/economic/log/sync-log-client.tsx', 'utf8')
eq('tjek-banner', view.includes('data-testid="sync-log-economic-error"') && view.includes('Det tælles ikke som at e-conomic mangler. Genforsøg er deaktiveret.'), true)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat endnu.') && view.includes('initial.ok && !initial.integration_error && !initial.integration_ready'), true)
eq('taelle-banner', view.includes('data-testid="sync-log-counts-error"') && view.includes('Det tælles ikke som 0.'), true)
eq('liste-banner', view.includes('data-testid="sync-log-load-error"') && view.includes('Det tælles ikke som ingen eksportforsøg.'), true)
eq('tom liste bliver', view.includes('Ingen eksportforsøg i denne visning.'), true)
eq('tom kun ved succes', view.includes('initial.ok && entries.length === 0'), true)
eq('taeller skjules', view.includes("initial.counts_error ? '—' : String(count)"), true)
eq('mobil kan rulle', view.includes('data-testid="sync-log-table"') && view.includes('overflow-x-auto') && view.includes('min-w-[720px]'), true)
eq('prov igen bliver', view.includes('retryInvoiceExportAction'), true)

console.log(fail ? `\n${fail} fejl` : '\nsync-log-load-test OK')
process.exitCode = fail ? 1 : 0
