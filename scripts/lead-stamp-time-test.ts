/** Leadets tidsstempler vises i københavnsk tid. Lukkedatoen bliver. Kør: npx tsx scripts/lead-stamp-time-test.ts */
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

const src = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
const mail = src.slice(src.indexOf('lead-source-mail'), src.indexOf('lead-source-mail') + 1800)
const meta = src.slice(src.indexOf('>Metadata<'), src.indexOf('>Metadata<') + 1200)
const activity = src.slice(src.indexOf('activity.created_at') - 80, src.indexOf('activity.created_at') + 80)
eq('modtagelse bruger hjaelperen', mail.includes('copenhagenDateTimeLabel(cf.source_email_received_at)'), true)
eq('mail-linket bliver', mail.includes('data-testid="lead-source-mail-link"'), true)
eq('oprettet bruger hjaelperen', meta.includes('copenhagenDateTimeLabel(lead.created_at)'), true)
eq('opdateret bruger hjaelperen', meta.includes('copenhagenDateTimeLabel(lead.updated_at)'), true)
eq('raekken kan ombrydes', meta.includes('flex flex-wrap items-baseline justify-between'), true)
eq('aktivitet bruger hjaelperen', activity.includes('copenhagenDateTimeLabel(activity.created_at)'), true)
eq('lukkedato bliver en kalenderdato', src.includes('new Date(lead.expected_close_date)') && src.includes("'d. MMMM yyyy'"), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
