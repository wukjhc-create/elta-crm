/** Bekraeftelsestid vises i koebenhavn. Indsendelse bliver. Koer: npx tsx scripts/confirmation-clock-test.ts */
import fs from 'fs'
import { copenhagenDateLabel, copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = '2026-01-15T23:30:00.000Z'
eq('dato er naeste dag', copenhagenDateLabel(late).startsWith('16'), true)
eq('tid starter paa 16', copenhagenDateTimeLabel(late).startsWith('16'), true)
eq('klokken er 00.30', copenhagenDateTimeLabel(late).includes('00.30') || copenhagenDateTimeLabel(late).includes('00:30'), true)
eq('lang maaned er januar', copenhagenDateTimeLabel(late, 'long').toLowerCase().includes('januar'), true)

const doc = fs.readFileSync('src/components/modules/customers/document-confirmation-status.tsx', 'utf8')
eq('dokumenttid bruger hjaelperen', doc.includes('return copenhagenDateTimeLabel(iso)'), true)
eq('udloeb bruger hjaelperen', doc.includes('return copenhagenDateLabel(iso)'), true)
eq('mail sendt vises', doc.includes('formatDateTime(item.mailSentAt)'), true)
eq('bekraeftet vises', doc.includes('formatDateTime(item.confirmedAt)'), true)
eq('listekald bliver', doc.includes('listConfirmationsForDocument'), true)

const portal = fs.readFileSync('src/app/portal/confirm-besigtigelse/[token]/confirm-client.tsx', 'utf8')
eq('portal dato bruger hjaelperen', portal.includes("return copenhagenDateLabel(iso, 'long')"), true)
eq('portal tid bruger hjaelperen', portal.includes("return copenhagenDateTimeLabel(iso, 'long')"), true)
eq('indsendelse bliver', portal.includes('submitConfirmation'), true)
eq('knappen bliver', portal.includes('Bekræft rapport'), true)

console.log(fail ? `\n${fail} fejl` : '\nconfirmation-clock-test OK')
process.exitCode = fail ? 1 : 0
