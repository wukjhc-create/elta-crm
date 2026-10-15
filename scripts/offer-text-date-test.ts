/** Genereret tilbudstekst dateres i koebenhavnsk kalender. Prislinjerne bliver. Koer: npx tsx scripts/offer-text-date-test.ts */
import fs from 'fs'
import { copenhagenDateLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateLabel('2026-10-14T22:30:00Z')
eq('sen aften er naeste dag', late.startsWith('15'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('14'), false)
eq('oktober bliver', late.toLowerCase().includes('okt'), true)

const src = fs.readFileSync('src/lib/ai/offerGenerator.ts', 'utf8')
eq('datoen bruger hjaelperen', src.includes('Dato: ${copenhagenDateLabel(new Date())}'), true)
eq('ingen lokal intl-dato', src.includes("Intl.DateTimeFormat('da-DK')"), false)
eq('tilbudspris bliver', src.includes('TILBUDSPRIS'), true)
eq('kunden bliver', src.includes('Til: ${customerName}'), true)
eq('pdf-eksport kaldes ikke her', src.includes('export async function exportOfferAsPDF') || src.includes('export function exportOfferAsPDF'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-text-date-test OK')
process.exitCode = fail ? 1 : 0
