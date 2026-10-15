/** Sagsdokumentets dato er københavnsk. Filnavn og tom liste bliver. Kør: npx tsx scripts/case-doc-date-test.ts */
import fs from 'fs'
import { copenhagenDateLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateLabel('2026-01-15T23:30:00.000Z')
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-documents-tab.tsx', 'utf8')
eq('datoen bruger hjaelperen', src.includes('copenhagenDateLabel(doc.created_at)'), true)
eq('filnavnet ombrydes', src.includes('text-sm font-medium break-all">{doc.file_name}'), true)
eq('filnavnet klippes ikke', src.includes('truncate'), false)
eq('tom liste bliver', src.includes('Ingen dokumenter på denne sag'), true)
eq('date-fns er vaek', src.includes("from 'date-fns'"), false)

console.log(fail ? `\n${fail} fejl` : '\ncase-doc-date-test OK')
process.exitCode = fail ? 1 : 0
