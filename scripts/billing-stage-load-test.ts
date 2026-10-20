/** Rate- og slutfakturakladden siger at en fejl ikke er 0 kr. Fradrag og gul tekst bliver. Koer: npx tsx scripts/billing-stage-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')

eq('rate siger ikke 0 kr', src.includes('data-testid="billing-percent-load-error"') && src.includes('<span>{loadError}. Det tælles ikke som 0 kr.</span>'), true)
eq('slut siger ikke 0 i fradrag', src.includes('data-testid="billing-final-load-error"') && src.includes('{loadError}. Det tælles ikke som 0 kr i fradrag.'), true)
eq('gul sluttekst bliver', src.includes('Slutfaktura findes allerede på sagen.'), true)
eq('fradrag bliver', src.includes('netStageAmount(p.total_amount, p.credited_amount)'), true)
eq('standard-fejl bliver', src.includes('data-testid="billing-unbilled-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-stage-load-test OK')
process.exitCode = fail ? 1 : 0
