/** Projektaktivitet grupperes i københavnsk dato. Timer og sortering bliver. Kør: npx tsx scripts/project-activity-time-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const label = new Date('2026-01-15T23:30:00.000Z').toLocaleDateString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})
eq('sen aften er den 16', label.includes('16'), true)
eq('sen aften er januar', label.toLowerCase().includes('januar'), true)
eq('sen aften er ikke kun utc-dagen', label.startsWith('torsdag den 15') || label.includes(' 15. '), false)

const src = fs.readFileSync('src/components/modules/projects/project-activity-timeline.tsx', 'utf8')
eq('gruppen er koebenhavn', src.includes("timeZone: 'Europe/Copenhagen'") && src.includes("month: 'long'"), true)
eq('timer bliver', src.includes('registrerede ${entry.hours}t'), true)
eq('sortering bliver', src.includes('new Date(b.date).getTime() - new Date(a.date).getTime()'), true)
eq('relativ tid bliver', src.includes('formatTimeAgo(item.date)'), true)
eq('tom liste bliver', src.includes('Ingen aktivitet endnu'), true)

console.log(fail ? `\n${fail} fejl` : '\nproject-activity-time-test OK')
process.exitCode = fail ? 1 : 0
