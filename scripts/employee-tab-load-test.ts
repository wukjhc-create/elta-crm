/** Medarbejderens loen og job siger naar hentningen kaster. Tom jobliste og satser bliver. Koer: npx tsx scripts/employee-tab-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/employees/[id]/employee-tabs.tsx', 'utf8')
eq('loen fanger kast', src.includes("setState({ loading: false, error: 'Kunne ikke hente løn og satser' })"), true)
eq('loen er ikke manglende detaljer', src.includes('Det tælles ikke som manglende løndetaljer.'), true)
eq('manglende detaljer bliver', src.includes('Ingen løndetaljer registreret. Sættes på Rediger medarbejder-siden.'), true)
eq('job fanger kast', src.includes('Kunne ikke hente job. Det tælles ikke som ingen job.'), true)
eq('tom jobliste bliver', src.includes('Ingen job tildelt.'), true)
eq('naeste skridt bliver', src.includes('Planlæg jobbet i kalenderen.'), true)
eq('jobtitel bliver', src.includes("break-words min-w-0 flex-1\">{j.title ?? 'Job'}"), true)
eq('satser bliver', src.includes('dkk(comp.hourly_wage)') && src.includes('dkk(comp.real_hourly_cost)'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-tab-load-test OK')
process.exitCode = fail ? 1 : 0
