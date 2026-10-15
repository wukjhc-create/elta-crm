/** Godkendelsespreviewets beloeb kan krympe. fmtAmount bliver. Koer: npx tsx scripts/approve-header-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
eq('gitter kan krympe', src.includes('grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-xs min-w-0'), true)
const field = src.slice(src.indexOf('function Field'))
eq('celle kan krympe', field.includes('className="min-w-0"'), true)
eq('vaerdi ombrydes', field.includes('text-gray-900 break-words'), true)
eq('ekskl bliver', src.includes('fmtAmount(inv.amount_excl_vat)'), true)
eq('moms bliver', src.includes('fmtAmount(inv.vat_amount)'), true)
eq('total bliver', src.includes('fmtAmount(inv.amount_incl_vat)'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\napprove-header-wrap-test OK')
process.exitCode = fail ? 1 : 0
