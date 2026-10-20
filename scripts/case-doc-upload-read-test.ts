/** Sags-upload uploader ikke naar sagen ikke kan laeses. Koer: npx tsx scripts/case-doc-upload-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-documents.ts', 'utf8')
const start = action.indexOf('export async function uploadCaseDocument')
const end = action.indexOf('export async function setCustomerDocumentPortalVisibility')
const body = action.slice(start, end)
eq('funktion findes', body.length > 80, true)
eq('laesefejl foer ikke-fundet', body.indexOf('if (scErr)') < body.indexOf("error: 'Sag ikke fundet'"), true)
eq('laesefejl foer upload', body.indexOf('Dokumentet er ikke uploadet.') < body.indexOf('.upload('), true)
eq('ikke-fundet bliver', body.includes("error: 'Sag ikke fundet'"), true)
eq('uden kunde bliver', body.includes("error: 'Sagen har ingen kunde — kan ikke gemme dokument'"), true)
eq('stoerrelse bliver', body.includes("error: 'Filen er for stor (max 20 MB)'"), true)
eq('type bliver', body.includes("error: 'Kun billeder (JPG, PNG, WEBP, HEIC) og PDF'"), true)
eq('scope bliver', body.includes("error: 'Sagen er ikke tildelt dig'"), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-doc-upload-read-test OK')
process.exitCode = fail ? 1 : 0
