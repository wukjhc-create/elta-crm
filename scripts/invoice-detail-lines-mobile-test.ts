/** Fakturalinjer paa fakturasiden kan laeses paa mobil. Beloebene bliver. Koer: npx tsx scripts/invoice-detail-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="invoice-detail-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words text-gray-900">{l.position}. {l.description}'), true)
eq('antal bliver', mobile.includes('fmtNum(Number(l.quantity), 2)'), true)
eq('stk-pris bliver', mobile.includes('fmtKr(l.unit_price, inv.currency)'), true)
eq('linjetotal bliver', mobile.includes('fmtKr(l.total_price, inv.currency)'), true)
eq('kilde bliver', mobile.includes('lineSourceLabel(l)'), true)
eq('subtotal bliver', mobile.includes('fmtKr(inv.total_amount, inv.currency)'), true)
eq('moms bliver', mobile.includes('fmtKr(inv.tax_amount, inv.currency)'), true)
eq('inkl moms bliver', mobile.includes('fmtKr(inv.final_amount, inv.currency)'), true)
eq('betalt bliver', mobile.includes('fmtKr(inv.amount_paid, inv.currency)'), true)
eq('desktop-beskrivelse bliver', src.includes('break-words max-w-[16rem]">{l.description}'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-detail-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
