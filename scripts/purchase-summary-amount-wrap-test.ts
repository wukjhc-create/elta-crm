/** Indkoebskortets beloeb ombrydes. kr() og den tomme tekst bliver. Koer: npx tsx scripts/purchase-summary-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')
eq('gitter kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0'), true)
const stat = src.slice(src.indexOf('function Stat'))
eq('celle kan krympe', stat.includes('className="min-w-0"'), true)
eq('beloeb ombrydes', stat.includes('break-words ${strong'), true)
eq('reference ombrydes', src.includes('font-medium text-gray-800 break-words'), true)
eq('materialer bliver', src.includes('kr(data.supplier_material_cost_total)'), true)
eq('udlaeg bliver', src.includes('kr(data.supplier_other_cost_total)'), true)
eq('indkoeb i alt bliver', src.includes('kr(data.supplier_purchase_total)'), true)
eq('reference-tal bliver', src.includes('kr(data.budget_reference)'), true)
eq('tom tekst bliver', src.includes('Ingen leverandørfaktura-linjer konverteret til denne sag endnu.'), true)
eq('fejl er ikke 0', src.includes('Det tælles ikke som 0 kr.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\npurchase-summary-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
