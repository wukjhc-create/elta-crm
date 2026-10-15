/** AI-kundevalg kan rulles, og luk har et navn. Satser og fejltekst bliver. Koer: npx tsx scripts/ai-customer-modal-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')

eq('panelet kan rulles', src.includes('max-w-md mx-4 max-h-[90vh] overflow-y-auto'), true)
eq('luk har et navn', src.includes('aria-label="Luk"'), true)
eq('soegning har et navn', src.includes('aria-label="Søg efter kunde"'), true)
eq('navn ombrydes', src.includes('font-medium break-words">{customer.name}'), true)
eq('ikke ingen kunder', src.includes('Det tælles ikke som ingen kunder.'), true)
eq('tom liste bliver', src.includes("'Ingen kunder'"), true)
eq('annuller bliver', src.includes('Annuller'), true)
eq('satser bliver', src.includes('hourly_rate: 450') && src.includes('margin_percentage: 25') && src.includes('risk_buffer_percentage: 5'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-customer-modal-mobile-test OK')
process.exitCode = fail ? 1 : 0
