/** Fakturaens eksporteret-tid er københavnsk. Bogføring og status bliver. Kør: npx tsx scripts/invoice-export-time-test.ts */
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

const src = fs.readFileSync('src/components/modules/invoices/invoice-accounting-panel.tsx', 'utf8')
eq('eksporttid bruger hjaelperen', src.includes('copenhagenDateTimeLabel(state.exported_at)'), true)
eq('linjen kan ombrydes', src.includes('text-xs text-gray-500 break-words'), true)
eq('statusraekken kan ombrydes', src.includes('flex flex-wrap items-center gap-x-2 gap-y-1'), true)
eq('eksportknappen bliver', src.includes('exportInvoiceToEconomicAction'), true)
eq('fejlteksten bliver', src.includes('Ret fakturaen (eller kreditér og genudsted) før den kan eksporteres.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-export-time-test OK')
process.exitCode = fail ? 1 : 0
