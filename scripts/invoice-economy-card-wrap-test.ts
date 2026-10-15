/** Fakturaokonomiens noeglekort ombryder beloeb. kr() og links bliver. Koer: npx tsx scripts/invoice-economy-card-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/dashboard/invoice-economy-section.tsx', 'utf8')
eq('foerste gitter kan krympe', src.includes('grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0'), true)
eq('andet gitter kan krympe', src.includes('grid grid-cols-2 md:grid-cols-4 gap-3 -mt-1 min-w-0'), true)
eq('beloeb ombrydes', src.includes('text-lg font-bold tabular-nums text-gray-900 break-words'), true)
eq('label ombrydes', src.includes('break-words min-w-0">{label}'), true)
eq('kort kan krympe', src.includes('block min-w-0 rounded-lg'), true)
eq('udestaaende bliver', src.includes('kr(data.outstanding_total)'), true)
eq('forfaldsbeloeb bliver', src.includes('kr(data.overdue_total)'), true)
eq('betalt bliver', src.includes('kr(data.paid_this_month)'), true)
eq('sendt bliver', src.includes('kr(data.sent_unpaid_total)'), true)
eq('forfald-link bliver', src.includes('href="/dashboard/invoices?filter=overdue"'), true)
eq('betalt-link bliver', src.includes('href="/dashboard/invoices?filter=paid"'), true)
eq('klipper ikke', src.includes('truncate'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\ninvoice-economy-card-wrap-test OK')
process.exitCode = fail ? 1 : 0
