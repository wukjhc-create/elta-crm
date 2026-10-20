/** Mine timer siger naar listen er klippet ved 12. Timer, dato og status bliver. Koer: npx tsx scripts/my-hours-cap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/my-hours-card.tsx', 'utf8')
eq('loftet bliver 12', src.includes('week.entries.slice(0, 12)'), true)
eq('loftet siges', src.includes('data-testid="my-hours-capped"') && src.includes('Viser 12 af {week.entries.length} registreringer. De øvrige {week.entries.length - 12} er ikke med i listen.'), true)
eq('kun naar der er flere', src.includes('week.entries.length > 12 &&'), true)
eq('tom uge bliver', src.includes('Ingen timer registreret i denne uge. Registrér tiden på sagen under Planlægning.'), true)
eq('datoen bliver utc', src.includes("new Date(`${d}T12:00:00Z`)") && src.includes("timeZone: 'UTC'"), true)
eq('timer bliver', src.includes('fmtH(e.hoursNum)'), true)
eq('status bliver', src.includes('data-testid="my-hours-rejected"') && src.includes('data-testid="my-hours-pending"') && src.includes('data-testid="my-hours-approved"'), true)
eq('skjules uden link', src.includes('if (!res.ok || !res.linked) return null'), true)
eq('kalenderlink bliver', src.includes('href="/dashboard/calendar"'), true)

console.log(fail ? `\n${fail} fejl` : '\nmy-hours-cap-test OK')
process.exitCode = fail ? 1 : 0
