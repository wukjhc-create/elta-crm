/** Beskedtrådens klokkeslæt er københavnsk tid. Kør: npx tsx scripts/message-stamp-time-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateTimeLabel('2026-01-15T23:30:00.000Z', 'long')
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)
eq('klokken er 00.30', late.includes('00.30') || late.includes('00:30'), true)

const src = fs.readFileSync('src/components/modules/messages/message-thread.tsx', 'utf8')
eq('besked bruger hjaelperen', src.includes("copenhagenDateTimeLabel(message.created_at, 'long')"), true)
eq('svar bruger hjaelperen', src.includes('copenhagenDateTimeLabel(reply.created_at)'), true)
eq('svaret kan ombrydes', src.includes('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-2'), true)
eq('emnet ombrydes stadig', src.includes('font-semibold break-words min-w-0 flex-1">{message.subject}'), true)
eq('slet har stadig et navn', src.includes('aria-label="Slet besked"'), true)
eq('date-fns er vaek', src.includes("from 'date-fns'"), false)

console.log(fail ? `\n${fail} fejl` : '\nmessage-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
