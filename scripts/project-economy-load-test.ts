/** Sagens projektokonomi siger at en fejl ikke er 0 kr. Beloeb og kontraktsum-tekst bliver. Koer: npx tsx scripts/project-economy-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-project-economy-card.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="project-economy-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0 kr', src.includes('Det tælles ikke som 0 kr.'), true)
eq('graa fejl er vaek', src.includes('text-gray-400 py-2">{error || \'Ingen data\'}'), false)
eq('faktureret bliver', src.includes('kr(data.net_invoiced)'), true)
eq('betalt bliver', src.includes('kr(data.paid_total)'), true)
eq('udestaaende bliver', src.includes('kr(data.outstanding_total)'), true)
eq('rest bliver', src.includes('kr(data.remaining_to_invoice)'), true)
eq('kontraktsum-tekst bliver', src.includes('Sagen mangler en kontraktsum'), true)
eq('kost holdes ude', src.includes('ingen intern kost, margin eller dækningsbidrag'), true)

console.log(fail ? `\n${fail} fejl` : '\nproject-economy-load-test OK')
process.exitCode = fail ? 1 : 0
