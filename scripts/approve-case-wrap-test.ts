/** Godkendelsespreviewets sagstitel ombrydes. Link og match-knap bliver. Koer: npx tsx scripts/approve-case-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
eq('titel ombrydes', src.includes('font-medium break-words">{detail.case.project_name || detail.case.title}'), true)
eq('kunde ombrydes', src.includes('text-emerald-700 break-words'), true)
eq('link bliver', src.includes('href={`/dashboard/orders/${detail.case.case_number}`}'), true)
eq('match-tekst bliver', src.includes('Match fakturaen til en sag før godkendelse'), true)
eq('knappen bliver', src.includes('whitespace-nowrap disabled:opacity-60'), true)
eq('beloeb bliver', src.includes('fmtAmount(inv.amount_incl_vat)'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\napprove-case-wrap-test OK')
process.exitCode = fail ? 1 : 0
