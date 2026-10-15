/** Download-links udleveres ikke naar dokumenttjekket fejler. Koer: npx tsx scripts/customer-doc-download-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-documents.ts', 'utf8')
const start = action.indexOf('export async function getDocumentDownloadUrls')
const end = action.indexOf('export async function uploadCustomerDocument')
const body = action.slice(start, end)
eq('funktion findes', body.length > 80, true)
eq('fejl foer link', body.indexOf('if (rowsErr)') < body.indexOf('createSignedUrl'), true)
eq('ingen link ved fejl', body.includes('Ingen link er udleveret.'), true)
eq('tilladelse bliver', body.includes("error: 'Manglende tilladelse: customers.view'"), true)
eq('mailfilter bliver', body.includes("q = q.is('source_email_id', null)"), true)
eq('sti-vagt bliver', body.includes("p.includes('..')"), true)

const ui = fs.readFileSync('src/components/modules/customers/customer-documents-tab.tsx', 'utf8')
eq('fanen viser fejlen', ui.includes("toast.error(urlResult.error || 'Kunne ikke hente download-links')"), true)
eq('tomt udvalg stopper stadig', ui.includes('if (paths.length === 0)'), true)
eq('dokumentfejl bliver', ui.includes('Det tælles ikke som ingen dokumenter.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-doc-download-read-test OK')
process.exitCode = fail ? 1 : 0
