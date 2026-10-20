/** Konvertering siger naar sagen ikke kan laeses. Ikke-matchet og linjerne bliver. Koer: npx tsx scripts/conversion-preview-case-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Sagen kunne ikke hentes. Det tælles ikke som ikke matchet.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceConversionPreviewAction')
const end = action.indexOf('export async function uploadIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('sag siger fejl', fn.includes('if (caseErr)') && fn.includes('caseFailed = true'), true)
eq('flag paa svaret', fn.includes('case_failed: caseFailed'), true)
eq('linjer siger stadig fejl', fn.includes('Kunne ikke hente linjerne. Det tælles ikke som en faktura uden linjer.'), true)
eq('ikke-fundet bliver', fn.includes("message: 'Faktura ikke fundet'"), true)
eq('match-krav bliver', fn.includes('requires_case_match: !inv.matched_case_id'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
eq('banner', view.includes('data-testid="conversion-preview-case-error"') && view.includes(msg), true)
eq('ikke matchet bliver', view.includes('ikke matchet'), true)
eq('linje-fejl bliver', view.includes('data-testid="conversion-preview-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\nconversion-preview-case-test OK')
process.exitCode = fail ? 1 : 0
