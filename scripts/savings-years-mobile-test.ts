/** Solcelle-oversigtens aar kan laeses paa mobil. Belobene bliver. Koer: npx tsx scripts/savings-years-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/calculator/savings-chart.tsx', 'utf8')
const start = src.indexOf('data-testid="savings-years-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('samme aar', mobile.includes('[1, 5, 10, 15, 20, 25]'), true)
eq('break-even bliver', mobile.includes('year === breakEvenYear + 1'), true)
eq('produktion bliver', mobile.includes('formatNumber(data.production)'), true)
eq('aarlig bliver', mobile.includes('formatCurrency(data.savings)'), true)
eq('akkumuleret bliver', mobile.includes('formatCurrency(data.cumulativeSavings)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('formlen bliver', src.includes('p.cumulativeSavings >= totalPrice'), true)

console.log(fail ? `\n${fail} fejl` : '\nsavings-years-mobile-test OK')
process.exitCode = fail ? 1 : 0
