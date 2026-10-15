/** Dashboard-kort siger tomt i stedet for 0 procent. Koer: npx tsx scripts/dashboard-empty-stats-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('ingen leads er ikke 0 procent', src.includes("stats.leads.total === 0 ? 'Ingen leads endnu'"), true)
eq('konvertering vises naar der er leads', src.includes('konvertering'), true)
eq('ingen kunder', src.includes("'Ingen kunder endnu'"), true)
eq('ingen afventende tilbud kun naar beloeb ogsaa er 0', src.includes('pending_value === 0') && src.includes('Ingen tilbud afventer svar'), true)
eq('ingen sager kun naar timer ogsaa er 0', src.includes('total_hours === 0') && src.includes('Ingen aktive sager'), true)
eq('vaerdierne er de samme felter', src.includes('stats.leads.total - stats.leads.won - stats.leads.lost') && src.includes('stats.customers.active'), true)

console.log(fail ? `\n${fail} fejl` : '\ndashboard-empty-stats-test OK')
process.exitCode = fail ? 1 : 0
