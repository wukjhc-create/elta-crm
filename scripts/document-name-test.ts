/** Sagsdokumentets filnavn ombrydes. Tom liste er den samme. Koer: npx tsx scripts/document-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-documents-tab.tsx', 'utf8')
const rowStart = src.indexOf('function DocumentRow')
const row = src.slice(rowStart, src.indexOf('> Åbn', rowStart))

eq('raekken stables paa mobil', row.includes('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'), true)
eq('filnavnet ombrydes', row.includes('break-all') && row.includes('doc.file_name'), true)
eq('filnavnet klippes ikke', row.includes('truncate'), false)
eq('tom liste forklarer stadig', src.includes('Ingen dokumenter på denne sag') && src.includes('Tilføj fotos og dokumenter'), true)
eq('uden ret siger ikke ovenfor', src.includes('Upload kræver rettighed til at redigere sagen.') && src.includes('canUpload'), true)

console.log(fail ? `\n${fail} fejl` : '\ndocument-name-test OK')
process.exitCode = fail ? 1 : 0
