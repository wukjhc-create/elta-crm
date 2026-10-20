/** Fakturaens sidehoved kan laeses paa mobil. Status og nummer bliver. Koer: npx tsx scripts/invoice-header-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
eq('nummer ombrydes', src.includes('className="break-all">{inv.invoice_number}'), true)
eq('piller maa ombrydes', src.includes('text-2xl font-semibold flex flex-wrap items-center gap-2'), true)
eq('sagstitel ombrydes', src.includes('min-w-0 break-words">· {detail.case.project_name || detail.case.title}'), true)
eq('statuslabel bliver', src.includes('{STATUS_LABELS[status] ?? status}'), true)
eq('betaling bliver', src.includes('{PAYMENT_LABELS[inv.payment_status] ?? inv.payment_status}'), true)
eq('total bliver', src.includes('text-right shrink-0') && src.includes('fmtKr(inv.final_amount, inv.currency)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-header-mobile-test OK')
process.exitCode = fail ? 1 : 0
