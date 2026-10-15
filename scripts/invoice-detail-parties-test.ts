/** Fakturaens kunde, sag og forgængere siger naar opslaget fejler. Et aekte tomt svar bliver. Koer: npx tsx scripts/invoice-detail-parties-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/invoices.ts', 'utf8')
const start = action.indexOf('export async function getInvoiceDetailAction')
const body = action.slice(start, action.indexOf('async function auditInvoiceLifecycle'))
eq('kundefejl', body.includes("? 'Kunne ikke hente kunden.'"), true)
eq('sagsfejl', body.includes("? 'Kunne ikke hente sagen.'"), true)
eq('forgaengerfejl', body.includes("predecessorsError = 'Kunne ikke hente tidligere fakturaer.'"), true)
eq('forgaengerraekker fejler lukket', body.includes('if (predErr)') && body.includes('predErr ? [] : links ?? []'), true)
eq('fradrag bliver', body.includes('deduction_amount: Number(link.deduction_amount)'), true)
eq('linjefejl bliver', body.includes("linesError = linesRes.error ? 'Kunne ikke hente fakturalinjerne.' : null"), true)

const view = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
eq('kundebanner', view.includes('data-testid="invoice-customer-load-error"') && view.includes('Det tælles ikke som ingen kunde.'), true)
eq('aegte ingen kunde bliver', view.includes('Ingen kunde tilknyttet — fakturaen kan ikke sendes uden kunde-data.'), true)
eq('sagsbanner', view.includes('data-testid="invoice-case-load-error"') && view.includes('Det tælles ikke som ingen sag.'), true)
eq('aegte ingen sag bliver', view.includes('Ingen sag tilknyttet.'), true)
eq('arbejdsordre bliver', view.includes('Linket til arbejdsordre. Sagen vises når arbejdsordren er koblet til en sag.'), true)
eq('forgaengerbanner', view.includes('data-testid="invoice-predecessors-load-error"') && view.includes('Det tælles ikke som ingen tidligere fakturaer.'), true)
eq('aegte forgaengere vises', view.includes('!detail.predecessorsError && detail.predecessors.length > 0'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-detail-parties-test OK')
process.exitCode = fail ? 1 : 0
