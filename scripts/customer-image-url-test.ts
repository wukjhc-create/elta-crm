/** Besigtigelsesbilleder siger naar linket ikke kan laves. Tom mappe bliver. Koer: npx tsx scripts/customer-image-url-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-documents.ts', 'utf8')
const start = action.indexOf('export async function getCustomerImages')
const end = action.indexOf('export async function getDocumentDownloadUrls')
const body = action.slice(start, end)
eq('funktion findes', body.length > 80, true)
eq('listefejl foer tom mappe', body.indexOf("error: 'Kunne ikke hente billeder'") < body.indexOf('if (!files)'), true)
eq('tom mappe bliver', body.includes('if (!files)') && body.includes('return { success: true, data: [] }'), true)
eq('linkfejl foer billedet gemmes', body.indexOf('if (urlErr || !urlData?.signedUrl)') < body.indexOf('images.push('), true)
eq('flaget foelger med', body.includes('urls_failed: urlsFailed'), true)
eq('pladsholder springes over', body.includes(".emptyFolderPlaceholder"), true)

const ui = fs.readFileSync('src/components/modules/customers/customer-documents-tab.tsx', 'utf8')
eq('fanen siger det', ui.includes("imgsResult.urls_failed ? 'Nogle billeder kunne ikke vises' : null"), true)
eq('tom tekst kraever ingen fejl', ui.includes('!hasContent && !docsError && !imagesError') && ui.includes('Ingen dokumenter eller billeder endnu'), true)
eq('listefejlen bliver', ui.includes('Det tælles ikke som ingen dokumenter.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-image-url-test OK')
process.exitCode = fail ? 1 : 0
