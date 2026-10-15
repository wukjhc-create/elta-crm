/** Leverandoerfakturaens totalbeloeb ombrydes. fmtAmount og slet-teksten bliver. Koer: npx tsx scripts/incoming-header-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('flex flex-wrap items-center justify-end gap-3')
const end = src.indexOf('isTestInvoice && (', start)
const header = src.slice(start, end)
eq('raekken findes', start > 0 && end > start, true)
eq('beloeb kan krympe', header.includes('text-right min-w-0'), true)
eq('beloeb ombrydes', header.includes('text-2xl font-semibold break-words'), true)
eq('shrink-0 er vaek fra totalen', header.includes('text-right shrink-0'), false)
eq('fmtAmount bliver', header.includes('fmtAmount(inv.amount_incl_vat, inv.currency)'), true)
eq('slet-teksten bliver', src.includes('Slet test-faktura'), true)
eq('bekraeftelsen bliver', src.includes('Reelle fakturaer er beskyttet og kan ikke slettes ad denne vej.'), true)
eq('kunde-faktura laases ikke her', src.includes('fmtKr(inv.final_amount'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nincoming-header-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
