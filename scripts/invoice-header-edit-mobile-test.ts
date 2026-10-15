/** Leverandoerfakturaens rediger-sidehoved stabler felter. Beloeb og momsregel bliver. Koer: npx tsx scripts/invoice-header-edit-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/header-edit-form.tsx', 'utf8')
eq('felter stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm min-w-0'), true)
eq('fakturanummer fylder raekken paa desktop', src.includes('min-w-0 sm:col-span-2'), true)
eq('felt kan krympe', src.includes('w-full min-w-0 max-w-full rounded-md border border-gray-300 px-2 py-1 text-sm'), true)
eq('ekskl bliver', src.includes('data-testid="header-amount-excl"'), true)
eq('moms bliver', src.includes('data-testid="header-vat"'), true)
eq('inkl bliver', src.includes('data-testid="header-amount-incl"'), true)
eq('gem bliver', src.includes('data-testid="header-edit-save"'), true)
eq('momsregel bliver', src.includes('Ekskl. + moms skal give inkl. moms.'), true)
eq('fejl bliver', src.includes('data-testid="header-edit-error"') && src.includes('setError(r.message)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-header-edit-mobile-test OK')
process.exitCode = fail ? 1 : 0
