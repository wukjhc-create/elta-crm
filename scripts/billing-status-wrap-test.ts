/** Faktureringsstatusens tekst ombrydes. Status-tekster og kr() bliver. Koer: npx tsx scripts/billing-status-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/orders/case-billing-status-card.tsx', 'utf8')
eq('titel ombrydes', src.includes('text-sm font-semibold text-gray-900 break-words'), true)
eq('broedtekst ombrydes', src.includes('text-sm text-gray-700 mt-0.5 break-words'), true)
eq('timer ombrydes', src.includes('flex flex-wrap items-center gap-1 break-words'), true)
eq('laast ombrydes', src.includes('text-[11px] text-gray-500 mt-1 break-words'), true)
eq('intet bliver', src.includes('Intet at fakturere endnu'), true)
eq('klar bliver', src.includes('Klar til fakturering'), true)
eq('delvist bliver', src.includes('Delvist faktureret'), true)
eq('fuldt bliver', src.includes('Fuldt faktureret'), true)
eq('beloeb bliver', src.includes('kr(data.unbilled_sale_total)'), true)
eq('fejl bliver', src.includes('data-testid="billing-status-load-error"'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nbilling-status-wrap-test OK')
process.exitCode = fail ? 1 : 0
