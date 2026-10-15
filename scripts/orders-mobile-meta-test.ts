/** Sagskortet viser reference, rekvirent, ansvarlig og formand. Beloeb og gate bliver. Koer: npx tsx scripts/orders-mobile-meta-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/orders-list-client.tsx', 'utf8')
const start = src.indexOf('data-testid="orders-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('reference vises', mobile.includes('data-testid="order-mobile-reference"') && mobile.includes('Ref. {c.reference}'), true)
eq('rekvirent vises', mobile.includes('data-testid="order-mobile-requisition"') && mobile.includes('Rekvirent {c.requisition}'), true)
eq('ansvarlig vises', mobile.includes('data-testid="order-mobile-assignee"') && mobile.includes('{assigneeName}'), true)
eq('formand vises', mobile.includes('data-testid="order-mobile-formand"') && mobile.includes('Formand {formandName}'), true)
eq('felterne ombrydes', mobile.split('break-words" data-testid="order-mobile-').length - 1, 4)
eq('tomme felter skjules', mobile.includes('c.reference || c.requisition || assigneeName || formandName'), true)
eq('beloeb bliver', mobile.includes('fmtAmount(c.contract_sum)') && mobile.includes('fmtAmount(c.revised_sum)'), true)
eq('faktura-gate bliver', mobile.includes('canSeeBilling') && mobile.includes('net_invoiced'), true)
eq('haster bliver', mobile.includes('data-testid="order-priority"'), true)

console.log(fail ? `\n${fail} fejl` : '\norders-mobile-meta-test OK')
process.exitCode = fail ? 1 : 0
