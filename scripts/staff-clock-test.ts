/** Medarbejderens login og haendelser vises i koebenhavnsk tid. Kalenderdatoer og beloeb bliver. Koer: npx tsx scripts/staff-clock-test.ts */
import fs from 'fs'
import { copenhagenDateLabel, copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = '2026-01-15T23:30:00.000Z'
const stamp = copenhagenDateTimeLabel(late, 'short', false)
eq('sen aften er naeste dag', stamp.startsWith('16'), true)
eq('aaret er udeladt', stamp.includes('2026'), false)
eq('klokken er 00.30', stamp.includes('00.30') || stamp.includes('00:30'), true)
eq('lang dato har aar', copenhagenDateLabel(late).includes('2026'), true)

const activity = fs.readFileSync('src/app/dashboard/settings/team/user-activity-panel.tsx', 'utf8')
eq('login bruger hjaelperen', activity.includes("copenhagenDateTimeLabel(user.last_sign_in_at, 'short', false)"), true)
eq('gammel dato bruger hjaelperen', activity.includes('text: copenhagenDateLabel(iso)'), true)
eq('aldrig bliver', activity.includes("'Aldrig logget ind'"), true)
eq('online bliver', activity.includes("'Online nu'"), true)
eq('raekken kan ombrydes', activity.includes('flex flex-wrap items-center gap-4'), true)

const profile = fs.readFileSync('src/components/modules/employees/employee-profile-sections.tsx', 'utf8')
eq('haendelse bruger hjaelperen', profile.includes('return copenhagenDateTimeLabel(s)'), true)
eq('ugyldig dato bliver', profile.includes('Number.isNaN(d.getTime())') && profile.includes('return s'), true)
eq('kalenderdato bliver et udsnit', profile.includes('const day = (s: string | null) => (s ? s.slice(0, 10) :'), true)
eq('udstedelse bruger udsnittet', profile.includes('day(e.issued_date)') && profile.includes('day(c.expires_date)'), true)
eq('beloeb bliver', profile.includes("style: 'currency'"), true)
eq('historik kan ombrydes', profile.includes('flex flex-wrap gap-x-3 gap-y-0.5') && profile.includes('whitespace-nowrap w-32') === false, true)
eq('login-kald bliver', profile.includes('getEmployeeLoginStatus') && profile.includes('listEmployeeEvents'), true)

console.log(fail ? `\n${fail} fejl` : '\nstaff-clock-test OK')
process.exitCode = fail ? 1 : 0
