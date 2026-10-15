/** Mailens produktsogning ombryder netto og salg. formatCurrency og live-maerket bliver. Koer: npx tsx scripts/quote-search-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/quote-line-items-editor.tsx', 'utf8')
const start = src.indexOf('results.map((product, idx)')
const end = src.indexOf("formatCurrency(product.cost_price, 'DKK', 2)", start)
const row = src.slice(start, end)
eq('raekken findes', start > 0 && end > start, true)
eq('raekken kan brydes', row.includes('flex flex-wrap items-start gap-2.5 min-w-0'), true)
eq('pris kan krympe', row.includes('text-right min-w-0'), true)
eq('netto ombrydes', row.includes('text-xs text-gray-400 break-words'), true)
eq('ikke shrink-0', row.includes('text-right shrink-0'), false)
eq('salg ombrydes', src.includes('text-sm font-semibold text-green-700 break-words'), true)
eq('netto bliver', src.includes("formatCurrency(product.cost_price, 'DKK', 2)"), true)
eq('salg bliver', src.includes("formatCurrency(product.estimated_sale_price, 'DKK', 2)"), true)
eq('vejl bliver', src.includes("formatCurrency(product.list_price, 'DKK', 0)"), true)
eq('live bliver', row.includes('> Live'), true)
eq('navn ombrydes', row.includes('break-words">{product.product_name}'), true)
eq('linjenetto bliver', src.includes('Netto: ${formatCurrency(item.costPrice'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nquote-search-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
