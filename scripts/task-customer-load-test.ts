/** Ny opgave siger naar kundelisten fejler. Valg og tom opgaveliste bliver. Koer: npx tsx scripts/task-customer-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/tasks-page-client.tsx', 'utf8')

eq('kast siges', src.includes("setCustomerLoadError('Kunne ikke hente kunder')"), true)
eq('ikke ingen kunder', src.includes('Det tælles ikke som ingen kunder.'), true)
eq('hentning vises', src.includes('Henter kunder…'), true)
eq('vaelg kunde bliver', src.includes("toast.error('Vælg en kunde')"), true)
eq('kunde har et navn', src.includes('aria-label="Kunde"'), true)
eq('tom opgaveliste bliver', src.includes('Ingen opgaver fundet'), true)
eq('forfald sammenlignes stadig', src.includes('new Date(task.due_date) < new Date()'), true)

console.log(fail ? `\n${fail} fejl` : '\ntask-customer-load-test OK')
process.exitCode = fail ? 1 : 0
