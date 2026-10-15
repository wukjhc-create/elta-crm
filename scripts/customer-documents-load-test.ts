/** Kundens dokumenter siger naar hentningen fejler. Tom liste, deling og dato bliver. Koer: npx tsx scripts/customer-documents-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-documents.ts', 'utf8')
const start = action.indexOf('export async function getCustomerImages')
const fn = action.slice(start, action.indexOf('export async function getDocumentDownloadUrls'))
const err = fn.slice(fn.indexOf('if (error)'), fn.indexOf('if (!files)'))

eq('billeder findes', start > 0 && fn.length > 40, true)
eq('storagefejl er ikke tom', err.includes('success: false') && err.includes('Kunne ikke hente billeder') && !err.includes('data: []'), true)
eq('manglende filer bliver tomme', fn.includes('if (!files)') && fn.includes('return { success: true, data: [] }'), true)
eq('tilladelse bliver', fn.includes("error: 'Manglende tilladelse: customers.view'"), true)

const ui = fs.readFileSync('src/components/modules/customers/customer-documents-tab.tsx', 'utf8')
eq('fanen siger fejl', ui.includes('data-testid="customer-documents-load-error"') && ui.includes('Det tælles ikke som ingen dokumenter.'), true)
eq('tom liste bliver ved succes', ui.includes('!hasContent && !docsError && !imagesError') && ui.includes('Ingen dokumenter eller billeder endnu'), true)
eq('proev igen bliver', ui.includes('Prøv igen'), true)
eq('dato bliver', ui.includes('copenhagenDateLabel(doc.created_at)'), true)
eq('deling bliver', ui.includes('setCustomerDocumentPortalVisibility'), true)
eq('mailarkiv deles ikke', ui.includes('!doc.source_email_id && shareButton(doc)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-documents-load-test OK')
process.exitCode = fail ? 1 : 0
