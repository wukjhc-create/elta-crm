/** AI-anbefalingens detalje ombrydes. Farver og den tomme tekst bliver. Koer: npx tsx scripts/ai-insights-detail-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/dashboard/operational-overview.tsx', 'utf8')
const panel = src.slice(src.indexOf('function AiInsightsPanel'), src.indexOf('function StatGrid'))
eq('detalje ombrydes', panel.includes('text-xs opacity-80 mt-1 break-words">{i.detail}'), true)
eq('besked ombrydes stadig', panel.includes('text-sm font-medium break-words">{i.message}'), true)
eq('severity bliver', panel.includes("i.severity === 'critical'") && panel.includes("i.severity === 'warning'"), true)
eq('tom tekst bliver', panel.includes('Ingen aktuelle anbefalinger. De vises her, når der er et forslag.'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-insights-detail-wrap-test OK')
process.exitCode = fail ? 1 : 0
