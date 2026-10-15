/** Sagens dokumenter siger naar hentningen fejler. Tom liste, dato og tilladelse bliver. Koer: npx tsx scripts/case-documents-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const start = action.indexOf('export async function getDocumentsForCase')
const next = action.indexOf('export async function signOffServiceCase')
const body = action.slice(start, next === -1 ? start + 2500 : next)
eq('query-fejl er ikke tom liste', body.includes("error: 'Kunne ikke hente dokumenter'"), true)
eq('catch er ikke tom liste', body.split("error: 'Kunne ikke hente dokumenter'").length >= 3, true)
eq('manglende tilladelse bliver tom', body.includes("return { documents: [], error: null }"), true)
eq('beskrivelse renses stadig', body.includes('safeDocumentDescription(r.description)'), true)

const tab = fs.readFileSync('src/app/dashboard/orders/[id]/order-documents-tab.tsx', 'utf8')
eq('fanen siger fejl', tab.includes('data-testid="case-documents-load-error"') && tab.includes('Det tælles ikke som ingen dokumenter.'), true)
eq('fejl skjuler den tomme tekst', tab.includes('!loadError && documents.length === 0'), true)
eq('tom liste bliver', tab.includes('Ingen dokumenter på denne sag'), true)
eq('datoen bliver', tab.includes('copenhagenDateLabel(doc.created_at)'), true)
eq('fejl nulstiller ikke listen', tab.indexOf('if (res.error)') < tab.indexOf('setDocuments(res.documents)'), true)

const inspection = fs.readFileSync('src/app/dashboard/orders/[id]/order-inspection-tab.tsx', 'utf8')
eq('rapport siger fejl', inspection.includes('data-testid="case-reports-load-error"') && inspection.includes('Det tælles ikke som ingen rapporter.'), true)
eq('rapportfejl nulstiller ikke', inspection.indexOf('if (res.error)') < inspection.indexOf('setReports(res.documents.filter(isBesigtigelseReport))'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-documents-load-test OK')
process.exitCode = fail ? 1 : 0
