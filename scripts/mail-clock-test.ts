/** Mailens viste tid er koebenhavnsk. Forhaandsvisning og diagnostik bliver. Koer: npx tsx scripts/mail-clock-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel, copenhagenParts } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = '2026-10-14T22:30:00Z'
const short = copenhagenDateTimeLabel(late, 'short', false)
const long = copenhagenDateTimeLabel(late, 'long')
eq('kort starter paa 15', short.startsWith('15'), true)
eq('kort har klokken', short.includes('00.30') || short.includes('00:30'), true)
eq('lang maaned er oktober', long.toLowerCase().includes('oktober'), true)
eq('synk-klokken er 00:30', copenhagenParts(late).clock, '00:30')

const list = fs.readFileSync('src/app/dashboard/mail/mail-client.tsx', 'utf8')
eq('listen bruger hjaelperen', list.includes("return copenhagenDateTimeLabel(iso, 'short', false)"), true)
eq('lige nu bliver', list.includes("return 'Lige nu'"), true)
eq('synk bruger hjaelperen', list.includes('copenhagenParts(new Date()).clock'), true)
eq('modtagelse kaldes stadig', list.includes('formatDate(email.received_at)') || fs.readFileSync('src/app/dashboard/mail/components/mail-list.tsx', 'utf8').includes('formatDate(email.received_at)'), true)
eq('forhaandsvisning bliver paa en linje', list.includes('email.body_preview') || fs.readFileSync('src/app/dashboard/mail/components/mail-list.tsx', 'utf8').includes('text-xs text-gray-400 truncate mt-0.5'), true)
eq('diagnostik bliver', list.includes("toLocaleString('da-DK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })"), true)

const detail = fs.readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
eq('detalje bruger hjaelperen', detail.includes("return copenhagenDateTimeLabel(iso, 'long')"), true)
eq('ugyldig dato bliver', detail.includes('Number.isNaN(d.getTime())') && detail.includes('return iso'), true)
eq('sagsvaelger bliver klippet', detail.includes('max-w-[280px] truncate'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-clock-test OK')
process.exitCode = fail ? 1 : 0
