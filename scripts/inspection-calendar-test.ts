/** Besigtigelseskalenderens maanedsvalg har et navn. Koer: npx tsx scripts/inspection-calendar-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-client.tsx', 'utf8')
const nav = src.slice(src.indexOf('Month Navigation'), src.indexOf('Weekday headers'))

eq('forrige maaned har et navn', nav.includes('aria-label="Forrige måned"') && nav.includes('prevMonth'), true)
eq('naeste maaned har et navn', nav.includes('aria-label="Næste måned"') && nav.includes('nextMonth'), true)
eq('overskriften ombrydes', src.includes('flex flex-wrap items-center justify-between gap-3'), true)

console.log(fail ? `\n${fail} fejl` : '\ninspection-calendar-test OK')
process.exitCode = fail ? 1 : 0
