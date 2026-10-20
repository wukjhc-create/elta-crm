/** Forgaengere paa slutfakturaen kan laeses paa mobil. Fradraget bliver. Koer: npx tsx scripts/predecessor-invoices-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('data-testid="predecessor-invoices-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('label ombrydes', mobile.includes('break-words">{p.stage_label ?? \'—\'}'), true)
eq('procent bliver', mobile.includes('fmtPct(p.billing_percentage)'), true)
eq('fradrag bliver', mobile.includes('fmtKr(netDeduction(p))'), true)
eq('kreditering bliver', mobile.includes('fmtKr(p.total_amount)') && mobile.includes('fmtKr(p.credited_amount)'), true)
eq('status bliver', mobile.includes('{p.status}'), true)
eq('link bliver', mobile.includes('href={`/dashboard/invoices/${p.id}`}'), true)
eq('total bliver', mobile.includes('fmtKr(deductionTotal)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('kolonnen bliver', src.includes('Total fradrag (ekskl. moms)'), true)
eq('beregningen bliver', src.includes('netStageAmount(p.total_amount, p.credited_amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\npredecessor-invoices-mobile-test OK')
process.exitCode = fail ? 1 : 0
