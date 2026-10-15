/** Leverandoer- og fakturabeloeb paa indkoebskortet ombrydes. kr() og lofterne bliver. Koer: npx tsx scripts/purchase-summary-line-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')
eq('leverandoerbeloeb ombrydes', src.includes('font-medium text-gray-700 break-words min-w-0">{kr(b.total_cost)}'), true)
eq('fakturabeloeb ombrydes', src.includes('font-medium text-gray-700 break-words min-w-0 inline-flex flex-wrap items-center gap-1'), true)
eq('beloeb kan ikke laengere laases', src.includes('shrink-0 ml-2">{kr(b.total_cost)}') === false && src.includes('shrink-0 ml-2 inline-flex') === false, true)
eq('kr bliver', src.includes('kr(b.total_cost)') && src.includes('kr(iv.amount_incl_vat)'), true)
eq('leverandoer-loft bliver', src.includes('data-testid="purchase-suppliers-capped"'), true)
eq('faktura-loft bliver', src.includes('data-testid="purchase-invoices-capped"'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\npurchase-summary-line-wrap-test OK')
process.exitCode = fail ? 1 : 0
