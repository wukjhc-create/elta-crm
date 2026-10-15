/** Fakturaoverblikkets noeglekort og mobilbeloeb ombrydes. kr() og summerne bliver. Koer: npx tsx scripts/invoices-overview-summary-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/invoices/invoices-overview-client.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="invoices-mobile-list"')
const mobileEnd = src.indexOf('hidden md:block', mobileStart)
const mobile = src.slice(mobileStart, mobileEnd)
eq('gitter kan krympe', src.includes('grid grid-cols-2 md:grid-cols-5 gap-3 min-w-0'), true)
eq('beloeb ombrydes', src.includes('text-lg font-bold tabular-nums text-gray-900 break-words'), true)
eq('label ombrydes', src.includes('break-words min-w-0">{label}'), true)
eq('sendt bliver', src.includes("kr(summary.sentUnpaid, 'DKK')"), true)
eq('forfald bliver', src.includes("kr(summary.overdueSum, 'DKK')"), true)
eq('betalt bliver', src.includes("kr(summary.paidThisMonth, 'DKK')"), true)
eq('udestaaende bliver', src.includes("kr(summary.outstanding, 'DKK')"), true)
eq('summen bliver', src.includes('sentUnpaid += r.final_amount'), true)
eq('mobilbeloeb ombrydes', mobile.includes('font-medium tabular-nums break-words'), true)
eq('mobilbeloeb bliver', mobile.includes('kr(r.final_amount, r.currency)'), true)
eq('paamind bliver', mobile.includes('handleReminder(r)'), true)
eq('kost bliver ude', /cost_price|margin|dækningsbidrag/.test(mobile), false)

console.log(fail ? '\n' + fail + ' fejl' : '\ninvoices-overview-summary-wrap-test OK')
process.exitCode = fail ? 1 : 0
