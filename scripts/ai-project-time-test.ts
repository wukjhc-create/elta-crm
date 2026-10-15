/** AI-projektets tidligere analyser viser koebenhavnsk tid. Prisen bliver. Koer: npx tsx scripts/ai-project-time-test.ts */
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

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
eq('oprettet bruger hjaelperen', src.includes('copenhagenDateTimeLabel(analysis.created_at)'), true)
eq('prisen bliver', src.includes('formatCurrency(analysis.total_price)'), true)
eq('tom liste bliver', src.includes('Ingen tidligere analyser endnu.'), true)
eq('beskrivelsen bliver paa to linjer', src.includes('line-clamp-2'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-project-time-test OK')
process.exitCode = fail ? 1 : 0
