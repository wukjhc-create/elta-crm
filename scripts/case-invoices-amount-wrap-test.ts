/** Sagsfakturaens mobilkort ombryder nummer, kunde og beloeb. kr() og inkl. moms bliver. Koer: npx tsx scripts/case-invoices-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/orders/case-invoices-list.tsx', 'utf8')
const start = src.indexOf('data-testid="case-invoices-mobile"')
const end = src.indexOf('hidden md:block overflow-x-auto', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('nummer ombrydes', mobile.includes('font-mono text-gray-900 break-all">{it.invoice_number'), true)
eq('kunde ombrydes', mobile.includes('text-xs text-gray-600 break-words">{it.customer_name'), true)
eq('beloeb ombrydes', mobile.includes('tabular-nums font-medium text-gray-900 break-words'), true)
eq('beloeb bliver', mobile.includes('kr(it.final_amount, it.currency)'), true)
eq('inkl moms bliver', mobile.includes('inkl. moms'), true)
eq('status bliver', mobile.includes('shrink-0 inline-flex items-center gap-1'), true)
eq('aabn bliver', mobile.includes('> Åbn'), true)
eq('kost bliver ude', /cost_price|margin|dækningsbidrag/.test(mobile), false)

console.log(fail ? '\n' + fail + ' fejl' : '\ncase-invoices-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
