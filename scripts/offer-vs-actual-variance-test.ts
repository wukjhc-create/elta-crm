/** Tilbud mod faktisk siger når afvigelsen ikke kan beregnes. Beløb uden tal bliver en streg. Kør: npx tsx scripts/offer-vs-actual-variance-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx', 'utf8')
eq('afvigelse siger hvorfor', src.split("cost_deviation == null ? 'Kan ikke beregnes' :").length === 5, true)
eq('beloeb uden tal bliver streg', src.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), true)
eq('ukendt total bliver', src.includes('Den tælles ikke som 0 kr.'), true)
eq('data-status bliver', src.includes('data-status'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-vs-actual-variance-test OK')
process.exitCode = fail ? 1 : 0
