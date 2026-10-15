/** Sagens oprettet, lukket og underskrevet vises i koebenhavnsk tid. Start- og slutdato bliver. Koer: npx tsx scripts/case-stamp-long-time-test.ts */
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

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-detail-client.tsx', 'utf8')
const fn = src.slice(src.indexOf('function fmtDateLong'), src.indexOf('function fmtDateLong') + 280)
eq('lang tid bruger hjaelperen', fn.includes('return copenhagenDateTimeLabel(s)'), true)
eq('ugyldig dato bliver', fn.includes('Number.isNaN(d.getTime())') && fn.includes('return s'), true)
eq('oprettet vises', src.includes('fmtDateLong(sag.created_at)'), true)
eq('lukket vises', src.includes('fmtDateLong(sag.closed_at)'), true)
eq('underskrevet vises', src.includes('fmtDateLong(sag.signed_at)'), true)
eq('kalenderdato bliver et udsnit', src.includes('const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) :'), true)
eq('feltvaerdi ombrydes stadig', src.includes('text-right text-gray-900 min-w-0 break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-stamp-long-time-test OK')
process.exitCode = fail ? 1 : 0
