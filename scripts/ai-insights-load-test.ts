/** En fejl i AI-anbefalinger er ikke ingen anbefalinger. Den aegte tomme tekst og route-status bliver. Koer: npx tsx scripts/ai-insights-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/dashboard/operational-overview.tsx', 'utf8')
const panel = src.slice(src.indexOf('function AiInsightsPanel'), src.indexOf('function ', src.indexOf('function AiInsightsPanel') + 10))
const route = fs.readFileSync('src/app/api/dashboard/ai-insights/route.ts', 'utf8')
const thenBody = panel.slice(panel.indexOf('.then((j)'), panel.indexOf('.catch('))
eq('fejl saettes foer listen', thenBody.indexOf('j?.error') < thenBody.indexOf('setInsights(j?.insights ?? [])'), true)
eq('fejl rydder ikke listen', thenBody.slice(thenBody.indexOf('j?.error'), thenBody.indexOf('setInsightsFailed(false)')).includes('setInsights('), false)
eq('netvaerk saetter fejl', panel.includes('if (!cancelled) setInsightsFailed(true)'), true)
eq('banneret siger det', panel.includes('data-testid="ai-insights-load-error"') && panel.includes('Anbefalinger kunne ikke hentes. Det tælles ikke som ingen anbefalinger.'), true)
eq('tom tekst kraever succes', panel.includes('loaded && !insightsFailed && insights.length === 0') && panel.includes('Ingen aktuelle anbefalinger. De vises her, når der er et forslag.'), true)
eq('route svarer 200 ved fejl', route.includes('{ status: 200 }'), true)
eq('rolle uden kostpris er tom liste', route.includes("hasPermission('economy.cost_prices')") && route.includes('insights: []'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-insights-load-test OK')
process.exitCode = fail ? 1 : 0
