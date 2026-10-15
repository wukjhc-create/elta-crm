/** Rapportens noegletal kan krympe, og beloebet ombrydes. Label og formler bliver. Koer: npx tsx scripts/report-kpi-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
const card = src.slice(src.indexOf('function KpiCard'), src.indexOf('function RevenueChart'))
eq('kortet kan krympe', card.includes('bg-white rounded-lg border p-4 min-w-0'), true)
eq('ikonet krymper ikke', card.includes('p-2 rounded-lg shrink-0'), true)
eq('label ombrydes stadig', card.includes('text-xs text-gray-500 break-words">{label}'), true)
eq('beloeb ombrydes', card.includes('text-lg font-bold text-gray-900 break-words">{value}'), true)
eq('undertekst ombrydes', card.includes('text-xs text-gray-400 break-words">{sublabel}'), true)
eq('omsaetning bliver', src.includes('value={formatCurrency(summary.total_revenue)}'), true)
eq('tabt omsaetning bliver', src.includes('value={formatCurrency(stats.lostRevenue)}'), true)
eq('top-aarsag bliver', src.includes('value={topReason?.label || \'—\'}'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-kpi-wrap-test OK')
process.exitCode = fail ? 1 : 0
