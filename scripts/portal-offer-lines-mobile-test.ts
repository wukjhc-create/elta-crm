/** Kundeportalens tilbudslinjer kan laeses paa mobil. Beloebene bliver. Koer: npx tsx scripts/portal-offer-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/portal/offer-detail.tsx', 'utf8')
const start = src.indexOf('data-testid="portal-offer-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words text-gray-900">{item.description}'), true)
eq('antal bliver', mobile.includes('{item.quantity} {item.unit}'), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(item.unit_price, currency, 2)'), true)
eq('total bliver', mobile.includes('formatCurrency(item.total, currency, 2)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('subtotal bliver', src.includes('formatCurrency(offer.total_amount, currency, 2)'), true)
eq('accept bliver', src.includes('Accepteret'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-offer-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
