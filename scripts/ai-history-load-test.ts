/** AI-historik og kundevalg siger naar hentningen fejler. Pris og tom liste bliver. Koer: npx tsx scripts/ai-history-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')

eq('historik kast siges', src.includes("setHistoryError('Kunne ikke hente analyser')"), true)
eq('ikke ingen analyser', src.includes('Det tælles ikke som ingen analyser.'), true)
eq('tom historik bliver', src.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), true)
eq('pris bliver', src.includes('formatCurrency(analysis.total_price)'), true)
eq('satser bliver', src.includes('hourly_rate: 450') && src.includes('margin_percentage: 25') && src.includes('risk_buffer_percentage: 5'), true)
eq('kunde kast siges', src.includes("setCustomerLoadError('Kunne ikke hente kunder')"), true)
eq('ikke ingen kunder', src.includes('Det tælles ikke som ingen kunder.'), true)
eq('tom kunder bliver', src.includes("'Ingen kunder'"), true)
eq('tid bliver', src.includes('copenhagenDateTimeLabel(analysis.created_at)'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-history-load-test OK')
process.exitCode = fail ? 1 : 0
