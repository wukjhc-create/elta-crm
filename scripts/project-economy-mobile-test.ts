/** Sagens projektokonomi kan laeses paa mobil. Kun salgstal, og de bliver. Koer: npx tsx scripts/project-economy-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-project-economy-card.tsx', 'utf8')

eq('tal stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), true)
eq('rest ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('faktureret netto bliver', src.includes('kr(data.net_invoiced)'), true)
eq('betalt bliver', src.includes('kr(data.paid_total)'), true)
eq('udestaaende bliver', src.includes('kr(data.outstanding_total)'), true)
eq('rest bliver', src.includes('kr(data.remaining_to_invoice)'), true)
eq('ingen kost', src.includes('ingen intern kost, margin eller dækningsbidrag'), true)
eq('manglende kontraktsum bliver', src.includes('Sagen mangler en kontraktsum'), true)

console.log(fail ? `\n${fail} fejl` : '\nproject-economy-mobile-test OK')
process.exitCode = fail ? 1 : 0
