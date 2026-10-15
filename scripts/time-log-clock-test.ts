/** Timelistens viste start og slut og dags dato er koebenhavnske. Kost og salg bliver. Koer: npx tsx scripts/time-log-clock-test.ts */
import fs from 'fs'
import { copenhagenDateLabel, copenhagenParts } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = '2026-01-15T23:30:00.000Z'
eq('sen aften er naeste dag', copenhagenDateLabel(late).startsWith('16'), true)
eq('sen aften er ikke utc-dagen', copenhagenDateLabel(late).startsWith('15'), false)
eq('klokken er 00:30', copenhagenParts(late).clock, '00:30')
eq('datoen er 2026-01-16', copenhagenParts(late).date, '2026-01-16')

const src = fs.readFileSync('src/app/dashboard/orders/[id]/work-order-time-logs.tsx', 'utf8')
eq('datoen bruger hjaelperen', src.includes('return copenhagenDateLabel(s)'), true)
eq('klokken bruger hjaelperen', src.includes('return copenhagenParts(s).clock'), true)
eq('i dag er koebenhavn', src.includes('const today = () => copenhagenParts(new Date()).date'), true)
eq('ugyldig dato bliver', src.includes('Number.isNaN(d.getTime())') && src.includes('return s'), true)
eq('rettelsen bruger samme dele', src.includes('const st = copenhagenParts(l.start_time)') && src.includes('setFixDate(st.date)') && src.includes('setFixStart(st.clock)'), true)
eq('pladsholder bliver', src.includes('placeholder="HH:mm"') && src.includes('Start (HH:mm)'), true)
eq('kost-gate bliver', src.includes('canSeeCost && totalCost > 0'), true)
eq('salgs-gate bliver', src.includes('canSeeSale && totalSale > 0'), true)
eq('oprettelsen bliver', src.includes('createTimeLog'), true)

console.log(fail ? `\n${fail} fejl` : '\ntime-log-clock-test OK')
process.exitCode = fail ? 1 : 0
