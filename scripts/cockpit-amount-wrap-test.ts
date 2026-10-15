/** Cockpittets ufakturerede beloeb og forfald ombrydes. kr() bliver. Koer: npx tsx scripts/cockpit-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/dashboard/styrings-cockpit.tsx', 'utf8')
const unbilledStart = src.indexOf('data-testid="cockpit-unbilled"')
const unbilledEnd = src.indexOf('function WebInquiriesCard', unbilledStart)
const unbilled = src.slice(unbilledStart, unbilledEnd)
const overdueStart = src.indexOf('data-testid="cockpit-overdue-invoices"')
const overdueEnd = src.indexOf('function PortalMessagesCard', overdueStart)
const overdue = src.slice(overdueStart, overdueEnd)
eq('ufaktureret findes', unbilledStart > 0 && unbilledEnd > unbilledStart, true)
eq('forfald findes', overdueStart > 0 && overdueEnd > overdueStart, true)
eq('salg ombrydes', unbilled.includes('break-words">{kr(c.sale)}'), true)
eq('forfald ombrydes', overdue.includes('break-words">{kr(i.amount)}'), true)
eq('salg bliver', unbilled.includes('{kr(c.sale)}'), true)
eq('forfald bliver', overdue.includes('{kr(i.amount)}'), true)
eq('sagslink bliver', unbilled.includes('/dashboard/orders/${c.id}?tab=fakturakladde'), true)
eq('fakturalink bliver', overdue.includes('/dashboard/invoices/${i.id}'), true)
eq('to linjer bliver', unbilled.includes('line-clamp-2 break-words font-medium') && overdue.includes('line-clamp-2 break-words font-medium'), true)
eq('ingen shrink-0', unbilled.includes('shrink-0') === false && overdue.includes('shrink-0') === false, true)

console.log(fail ? '\n' + fail + ' fejl' : '\ncockpit-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
