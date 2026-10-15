/** Sagens efterkalkulation siger når afvigelsen ikke kan beregnes. Beløb uden tal bliver en streg. Kør: npx tsx scripts/aftercalc-line-variance-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx', 'utf8')
eq('beloeb uden tal bliver streg', src.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), true)
eq('pengeafvigelse siger hvorfor', src.includes('if (amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>'), true)
eq('timer siger hvorfor', src.includes('if (value.amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>'), true)
eq('linje siger hvorfor', src.includes("r.cost_deviation == null ? 'Kan ikke beregnes' : moneyDev(r.cost_deviation, false)"), true)
eq('kendt merkost bliver roed', src.includes('const bad = goodWhenPositive ? amount < 0 : amount > 0'), true)
eq('ens tekst bliver', src.includes('Ens tekst alene står som ikke matchet.'), true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-line-variance-test OK')
process.exitCode = fail ? 1 : 0
