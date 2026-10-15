/** Forfaldsoverblik siger naar listen ikke kan laeses. Et aegte 0 og den groenne tekst bliver. Koer: npx tsx scripts/incoming-due-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke hente forfaldsoverblik. Det tælles ikke som 0.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceDueSummaryAction')
const end = action.indexOf('export interface ConversionPreviewLine')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl foer groent nul', fn.indexOf('if (error)') < fn.indexOf('ok: true'), true)
eq('siger fejl', fn.includes(msg), true)
eq('logger fejlen', fn.includes("logger.error('getIncomingInvoiceDueSummaryAction failed'"), true)
eq('kun godkendte', fn.includes(".eq('status', 'approved')"), true)
eq('i dag er koebenhavn', fn.includes('copenhagenParts(new Date()).date'), true)
eq('uden ret bliver', fn.includes("message: 'Manglende tilladelse: incoming_invoices.view'"), true)
eq('top 3 bliver', fn.includes('overdueRows.slice(0, 3)'), true)
eq('graense bliver', fn.includes('.limit(1000)'), true)

const view = fs.readFileSync('src/components/modules/dashboard/incoming-invoice-due-widget.tsx', 'utf8')
eq('widget viser fejl', view.includes('data-testid="incoming-due-load-error"') && view.includes('text-red-800'), true)
eq('groen tom bliver', view.includes('Ingen godkendte leverandørfakturaer forfalder lige nu.'), true)
eq('beløb bliver', view.includes('kr(t.amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-due-load-test OK')
process.exitCode = fail ? 1 : 0
