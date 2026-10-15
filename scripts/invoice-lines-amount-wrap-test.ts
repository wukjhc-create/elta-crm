/** Fakturalinjens mobilbeloeb ombrydes. fmtKr bliver, og headerens shrink-0 bliver. Koer: npx tsx scripts/invoice-lines-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="invoice-detail-lines-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('linjetotal ombrydes', mobile.includes('break-words">{fmtKr(l.total_price, inv.currency)}'), true)
eq('enhedslinje ombrydes', mobile.includes('text-xs tabular-nums text-gray-700 break-words'), true)
eq('subtotal ombrydes', mobile.includes('font-medium break-words">{fmtKr(inv.total_amount, inv.currency)}'), true)
eq('moms ombrydes', mobile.includes('font-medium break-words">{fmtKr(inv.tax_amount, inv.currency)}'), true)
eq('total ombrydes', mobile.includes('font-bold break-words">{fmtKr(inv.final_amount, inv.currency)}'), true)
eq('betalt ombrydes', mobile.includes('font-medium break-words">{fmtKr(inv.amount_paid, inv.currency)}'), true)
eq('beskrivelse bliver', mobile.includes('break-words text-gray-900">{l.position}. {l.description}'), true)
eq('antal bliver', mobile.includes('fmtNum(Number(l.quantity), 2)'), true)
eq('stk-pris bliver', mobile.includes('fmtKr(l.unit_price, inv.currency)'), true)
eq('ingen shrink-0 paa kortet', mobile.includes('shrink-0'), false)
eq('header shrink-0 bliver', src.includes('text-right shrink-0'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ninvoice-lines-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
