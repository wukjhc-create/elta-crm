/** Stage-fakturaer paa sagen kan laeses paa mobil. Beloeb, procent og status bliver. Koer: npx tsx scripts/stage-invoices-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('data-testid="stage-invoices-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('label ombrydes', mobile.includes('break-words">{r.stage_label ?? \'—\'}'), true)
eq('procent bliver', mobile.includes('fmtPct(r.billing_percentage)'), true)
eq('subtotal bliver', mobile.includes('fmtKr(r.total_amount)'), true)
eq('inkl moms bliver', mobile.includes('fmtKr(r.final_amount)'), true)
eq('status bliver', mobile.includes('invoiceStatusLabel(r.status)'), true)
eq('link bliver', mobile.includes('href={`/dashboard/invoices/${r.id}`}'), true)
eq('desktop-tabel bliver', src.includes('hidden md:block overflow-x-auto'), true)
eq('kolonnen bliver', src.includes('Total inkl. moms'), true)

console.log(fail ? `\n${fail} fejl` : '\nstage-invoices-mobile-test OK')
process.exitCode = fail ? 1 : 0
