/** Tilbudt vs faktisk ombryder kostlinjer. kr() og Kan ikke beregnes bliver. Koer: npx tsx scripts/offer-vs-actual-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="offer-vs-actual-mobile"'), src.indexOf('hidden md:block overflow-x-auto'))
eq('linjekost ombrydes', mobile.includes('text-xs text-gray-700 break-words">Tilbudt kost {kr(r.offered_cost)}'), true)
eq('linjeafvigelse ombrydes', mobile.includes('text-xs break-words">Afvigelse {r.cost_deviation == null ? \'Kan ikke beregnes\' :'), true)
eq('total ombrydes', mobile.includes('text-gray-800 break-words">Tilbudt kost {kr(figures.offered_cost)}'), true)
eq('totalafvigelse ombrydes', mobile.includes('className="break-words">Afvigelse {figures.cost_deviation == null ? \'Kan ikke beregnes\' :'), true)
eq('antal ombrydes', mobile.includes('text-xs text-gray-600 break-words">Tilbudt antal'), true)
eq('kr bliver', src.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), true)
eq('afvigelse siger stadig hvorfor', src.split("cost_deviation == null ? 'Kan ikke beregnes' :").length === 5, true)

console.log(fail ? `\n${fail} fejl` : '\noffer-vs-actual-wrap-test OK')
process.exitCode = fail ? 1 : 0
