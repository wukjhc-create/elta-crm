/** Seneste analyser bliver synlige naar samme hentning fejler. Tom liste og pris bliver. Koer: npx tsx scripts/ai-history-keep-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
eq('listen bliver', src.includes('De tidligere analyser bliver.') && src.includes('recentAnalyses.length > 0'), true)
eq('tom liste kraever ingen fejl', src.includes('!historyError && recentAnalyses.length === 0') && src.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), true)
eq('ikke ingen analyser', src.includes('Det tælles ikke som ingen analyser.'), true)
eq('rydder ikke listen', src.includes('setRecentAnalyses([])'), false)
eq('aegte liste bliver', src.includes('setRecentAnalyses(res.data ?? [])'), true)
eq('pris bliver', src.includes('formatCurrency(analysis.total_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-history-keep-test OK')
process.exitCode = fail ? 1 : 0
