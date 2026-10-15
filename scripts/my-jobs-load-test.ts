/** Mine job siger naar hentningen eller timetjekket fejler. Dato og tom uge bliver. Koer: npx tsx scripts/my-jobs-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/my-jobs-card.tsx', 'utf8')

eq('jobfejl siges', src.includes('Det tælles ikke som ingen job.'), true)
eq('timefejl siges', src.includes('Det tælles ikke som at tiden er registreret.'), true)
eq('tom uge bliver', src.includes('Ingen planlagte job de næste 7 dage.'), true)
eq('tom dag bliver', src.includes('Ingen job i dag.'), true)
eq('dato-skridt bliver', src.includes("new Date(`${day}T12:00:00Z`)") && src.includes('d.setUTCDate(d.getUTCDate() + n)'), true)
eq('dagslabel bliver utc', src.includes("timeZone: 'UTC'"), true)
eq('planlaegning bliver', src.includes('?tab=planlaegning'), true)
eq('navigering bliver', src.includes('data-testid="my-job-navigate"'), true)

console.log(fail ? `\n${fail} fejl` : '\nmy-jobs-load-test OK')
process.exitCode = fail ? 1 : 0
