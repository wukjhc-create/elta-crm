/** Hurtiganalysen viser ikke det forrige projekts tal for en anden tekst. 450/25/5 bliver. Koer: npx tsx scripts/ai-quick-stale-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
eq('anden tekst ryddes', src.includes('quickText.current !== term') && src.includes('setQuickResult(null)'), true)
eq('samme tekst bliver', src.includes('quickText.current === term') && src.includes('Det forrige estimat bliver.'), true)
eq('gammelt svar ignoreres', src.includes('quickReq.current !== id'), true)
eq('aegte estimat bliver', src.includes('setQuickResult(quickRes.data)'), true)
eq('ikke et estimat', src.includes('Det tælles ikke som et estimat.'), true)
eq('beloeb bliver', src.includes('formatCurrency(quickResult.estimatedPrice)'), true)
eq('fuld analyse bliver', src.includes('hourly_rate: 450') && src.includes('margin_percentage: 25') && src.includes('risk_buffer_percentage: 5'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-quick-stale-test OK')
process.exitCode = fail ? 1 : 0
