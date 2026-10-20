/** Leverandoerfakturaens sidehoved kan laeses paa mobil. Beloeb og sletning bliver. Koer: npx tsx scripts/incoming-header-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('beloeb maa ombrydes', src.includes('flex flex-wrap items-center justify-end gap-3'), true)
eq('beloeb bliver', src.includes('fmtAmount(inv.amount_incl_vat, inv.currency)'), true)
eq('leverandoer ombrydes', src.includes('break-words min-w-0">{detail.supplier?.name ?? inv.supplier_name_extracted ?? \'Ukendt leverandør\'}'), true)
eq('test-slet bliver', src.includes('Slet test-faktura'), true)
eq('bekraeftelsen bliver', src.includes('Reelle fakturaer er beskyttet og kan ikke slettes ad denne vej.'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-header-mobile-test OK')
process.exitCode = fail ? 1 : 0
