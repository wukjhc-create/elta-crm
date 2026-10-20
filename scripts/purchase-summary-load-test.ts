/** Indkoebskortet siger at en fejl ikke er 0 kr. Tom tekst og beloeb bliver. Koer: npx tsx scripts/purchase-summary-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="purchase-summary-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0 kr', src.includes('Det tælles ikke som 0 kr.'), true)
eq('graa fejl er vaek', src.includes('text-gray-400 py-2">{error || \'Ingen data\'}'), false)
eq('tom tekst bliver', src.includes('Ingen leverandørfaktura-linjer konverteret til denne sag endnu.'), true)
eq('nul er stadig tom', src.includes('data.converted_line_count === 0'), true)
eq('materialer bliver', src.includes('kr(data.supplier_material_cost_total)'), true)
eq('udlaeg bliver', src.includes('kr(data.supplier_other_cost_total)'), true)
eq('indkoeb i alt bliver', src.includes('kr(data.supplier_purchase_total)'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-summary-load-test OK')
process.exitCode = fail ? 1 : 0
