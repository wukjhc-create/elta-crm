/** Synkloggens tidspunkt er københavnsk. Status og tom liste bliver. Kør: npx tsx scripts/sync-log-time-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateTimeLabel('2026-01-15T23:30:00.000Z')
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)
eq('klokken er 00.30', late.includes('00.30') || late.includes('00:30'), true)

const src = fs.readFileSync('src/app/dashboard/settings/economic/log/sync-log-client.tsx', 'utf8')
eq('tiden bruger hjaelperen', src.includes('copenhagenDateTimeLabel(iso)'), true)
eq('raekken viser tiden', src.includes('dkDateTime(e.created_at)'), true)
eq('tom liste bliver', src.includes('Ingen eksportforsøg i denne visning.'), true)
eq('status bliver', src.includes("label: 'Sprunget over'"), true)
eq('prov igen bliver', src.includes('retryInvoiceExportAction'), true)

console.log(fail ? `\n${fail} fejl` : '\nsync-log-time-test OK')
process.exitCode = fail ? 1 : 0
