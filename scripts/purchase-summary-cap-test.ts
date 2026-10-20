/** Indkoebskortet siger naar leverandoerer eller fakturaer er klippet. Beloeb bliver. Koer: npx tsx scripts/purchase-summary-cap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')
eq('leverandoer-loft bliver 6', src.includes('data.supplier_breakdown.slice(0, 6)'), true)
eq('leverandoer-loft siges', src.includes('data-testid="purchase-suppliers-capped"') && src.includes('Viser 6 af {data.supplier_breakdown.length} leverandører. De øvrige {data.supplier_breakdown.length - 6} er ikke med i listen.'), true)
eq('leverandoer kun naar der er flere', src.includes('data.supplier_breakdown.length > 6 &&'), true)
eq('faktura-loft bliver 5', src.includes('data.invoices.slice(0, 5)'), true)
eq('faktura-loft siges', src.includes('data-testid="purchase-invoices-capped"') && src.includes('Viser 5 af {data.invoices.length} fakturaer. De øvrige {data.invoices.length - 5} er ikke med i listen.'), true)
eq('faktura kun naar der er flere', src.includes('data.invoices.length > 5 &&'), true)
eq('kost bliver', src.includes('kr(b.total_cost)') && src.includes('kr(iv.amount_incl_vat)'), true)
eq('reference bliver', src.includes('ikke dækningsbidrag eller margin'), true)
eq('tom liste bliver', src.includes('Ingen leverandørfaktura-linjer konverteret til denne sag endnu.'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-summary-cap-test OK')
process.exitCode = fail ? 1 : 0
