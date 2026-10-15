/** Kalenderens forrige og naeste siger dag eller uge, og visningen kan ombrydes. Skridtet er uaendret. Koer: npx tsx scripts/calendar-nav-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('forrige siger dag eller uge', src.includes("aria-label={view === 'week' ? 'Forrige uge' : 'Forrige dag'}"), true)
eq('naeste siger dag eller uge', src.includes("aria-label={view === 'week' ? 'Næste uge' : 'Næste dag'}"), true)
eq('visning kan ombrydes', src.includes('role="group" aria-label="Kalendervisning"'), true)
eq('valgt visning er trykket', src.includes('aria-pressed={view === v}'), true)
eq('uge traekker syv dage', src.includes("if (view === 'week') d.setDate(d.getDate() - 7)"), true)
eq('uge laegger syv dage', src.includes("if (view === 'week') d.setDate(d.getDate() + 7)"), true)
eq('dato er stadig middag uden z', src.includes("new Date(anchorDate + 'T12:00:00')"), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-nav-label-test OK')
process.exitCode = fail ? 1 : 0
