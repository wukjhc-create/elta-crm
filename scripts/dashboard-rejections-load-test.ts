/** Dashboard siger naar afvisninger ikke kan hentes. Tom tekst, rate og beloeb bliver. Koer: npx tsx scripts/dashboard-rejections-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('listen siger fejl', src.includes('data-testid="dashboard-rejections-load-error"') && src.includes('Det tælles ikke som ingen afvisninger.'), true)
eq('kortet siger fejl', src.includes('Kunne ikke hente afvisninger. Det tælles ikke som 0.'), true)
eq('fejlen er ikke et nul', src.includes("rejectionStatsError ? '—' : (rejectionStats?.totalRejected ?? 0)"), true)
eq('tom liste bliver', src.includes('Ingen afviste tilbud endnu.'), true)
eq('tom scope bliver', src.includes('Ingen afviste tilbud i scope'), true)
eq('rate bliver', src.includes('rejectionStats.rejectionRate.toFixed(1)'), true)
eq('beloeb bliver', src.includes('formatCurrency(r.final_amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\ndashboard-rejections-load-test OK')
process.exitCode = fail ? 1 : 0
