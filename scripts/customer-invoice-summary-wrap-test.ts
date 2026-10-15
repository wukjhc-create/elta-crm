/** Kundens fakturanoegletal og mobilbeloeb ombrydes. kr() og den tomme liste bliver. Koer: npx tsx scripts/customer-invoice-summary-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/customers/customer-invoice-overview.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="customer-invoices-mobile"')
const mobileEnd = src.indexOf('hidden md:block', mobileStart)
const mobile = src.slice(mobileStart, mobileEnd)
eq('gitter kan krympe', src.includes('grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0'), true)
eq('beloeb ombrydes', src.includes('text-lg font-bold tabular-nums text-gray-900 break-words'), true)
eq('label ombrydes', src.includes('break-words min-w-0">{label}'), true)
eq('kort kan krympe', src.includes('min-w-0 rounded-lg ring-1 bg-white'), true)
eq('udestaaende bliver', src.includes('kr(s.outstanding_total)'), true)
eq('forfald bliver', src.includes('kr(s.overdue_total)'), true)
eq('betalt bliver', src.includes('kr(s.paid_total)'), true)
eq('mobilbeloeb ombrydes', mobile.includes('tabular-nums break-words'), true)
eq('mobilbeloeb bliver', mobile.includes('kr(r.final_amount, r.currency)'), true)
eq('tom liste bliver', src.includes('Kunden har endnu ingen fakturaer. De oprettes fra sagen.'), true)
eq('kost bliver ude', src.includes('Ingen kost, margin eller dækningsbidrag.'), true)
eq('klipper ikke i kortet', mobile.includes('truncate'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\ncustomer-invoice-summary-wrap-test OK')
process.exitCode = fail ? 1 : 0
