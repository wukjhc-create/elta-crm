/** Stage-fakturaens subtotal og total ombrydes. fmtKr, procent og status bliver. Koer: npx tsx scripts/stage-invoices-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('data-testid="stage-invoices-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('subtotal ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words'), true)
eq('total ombrydes', mobile.includes('tabular-nums font-medium text-gray-900 break-words'), true)
eq('subtotal bliver', mobile.includes('fmtKr(r.total_amount)'), true)
eq('total bliver', mobile.includes('fmtKr(r.final_amount)'), true)
eq('procent bliver', mobile.includes('fmtPct(r.billing_percentage)'), true)
eq('status bliver', mobile.includes('invoiceStatusLabel(r.status)'), true)
eq('label bliver', mobile.includes('break-words">{r.stage_label ?? \'—\'}'), true)
eq('link bliver', mobile.includes('href={`/dashboard/invoices/${r.id}`}'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nstage-invoices-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
