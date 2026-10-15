/** Kalenderen siger ikke 0 arbejdsordrer naar hentningen fejler. Jobkortet bliver. Koer: npx tsx scripts/calendar-count-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('ikke 0', src.includes('Antallet kunne ikke hentes. Det tælles ikke som 0 arbejdsordrer.'), true)
eq('taeller kraever ingen fejl', src.includes('loadError') && src.includes('arbejdsordre${filteredWOs.length === 1 ? \'\' : \'r\'} i visningen'), true)
eq('ikke tildelt bliver', src.includes("wo.employee?.name || 'Ikke tildelt'"), true)
eq('ordrefejl bliver', src.includes('Kunne ikke hente arbejdsordrer: {loadError}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-count-load-test OK')
process.exitCode = fail ? 1 : 0
