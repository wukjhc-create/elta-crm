/** Fakturaen siger naar den eller linjerne ikke kan hentes. Ikke-fundet og den tomme kladde bliver. Koer: npx tsx scripts/invoice-detail-load-test.ts */
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
eq('funktionen findes', body.length > 200, true)
eq('laesefejl foer ikke-fundet', body.indexOf('if (error)') < body.indexOf('if (!invRaw)'), true)
eq('laesefejl er ikke vaek', body.includes("error: 'Kunne ikke hente fakturaen.'"), true)
eq('ikke-fundet bliver tom', body.includes('if (!invRaw) return { detail: null, error: null }'), true)
eq('tilladelse bliver tom', body.includes("if (!hasPermission('invoices.view.all'))") && body.includes('return { detail: null, error: null }'), true)
eq('linjefejl er ikke ingen linjer', body.includes("linesError = linesRes.error ? 'Kunne ikke hente fakturalinjerne.' : null"), true)
eq('linjefejl toemmer ikke aeegte linjer ved succes', body.includes('lines: linesError ? [] : ((linesRes.data ?? []) as InvoiceLineRow[])'), true)

const page = fs.readFileSync('src/app/dashboard/invoices/[id]/page.tsx', 'utf8')
eq('siden viser fejlen', page.includes('data-testid="invoice-detail-load-error"') && page.includes('Det tælles ikke som at fakturaen ikke findes.'), true)
eq('ikke-fundet bliver', page.includes('if (!loaded.detail) notFound()'), true)

const view = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
eq('linjebanner', view.includes('data-testid="invoice-lines-load-error"') && view.includes('Det tælles ikke som ingen linjer.'), true)
eq('tom kladde bliver', view.includes('Ingen linjer på fakturaen. Tilføj linjer i kladden ovenfor.'), true)
eq('tom tekst kraever ingen linjefejl', view.includes('detail.linesError ? (') && view.includes('detail.lines.length === 0'), true)
eq('kladde redigeres ikke ved linjefejl', view.includes('isDraft && canEditDraft && !detail.linesError'), true)
eq('genindlaesning viser fejlen', view.includes('else if (fresh.error) flash(false, fresh.error)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-detail-load-test OK')
process.exitCode = fail ? 1 : 0
