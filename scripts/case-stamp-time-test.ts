/** Sagens mailtid og afleveringsunderskrift vises i københavnsk tid. Kør: npx tsx scripts/case-stamp-time-test.ts */
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

const mail = fs.readFileSync('src/app/dashboard/orders/[id]/order-mails-tab.tsx', 'utf8')
eq('listen bruger hjaelperen', mail.includes('copenhagenDateTimeLabel(email.received_at)'), true)
eq('detaljen bruger hjaelperen', mail.includes('copenhagenDateTimeLabel(detail.received_at)'), true)
eq('detaljen kan ombrydes', mail.includes('break-words"><span className="text-gray-500">Modtaget:</span>'), true)
eq('intet emne bliver', mail.includes("'(Intet emne)'"), true)
eq('date-fns er vaek fra mail', mail.includes("from 'date-fns'"), false)

const handover = fs.readFileSync('src/app/dashboard/orders/[id]/order-handover-tab.tsx', 'utf8')
eq('underskrift bruger hjaelperen', handover.includes("copenhagenDateTimeLabel(data.signature.signed_at, 'long')"), true)
eq('ikke underskrevet bliver', handover.includes('Ikke underskrevet endnu.'), true)
eq('date-fns er vaek fra aflevering', handover.includes("from 'date-fns'"), false)

console.log(fail ? `\n${fail} fejl` : '\ncase-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
