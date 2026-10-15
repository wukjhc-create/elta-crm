/** Fakturakontrollens linjetekst ombrydes paa mobil. Overpris-tallet bliver. Koer: npx tsx scripts/invoice-control-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const panel = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
const start = panel.indexOf('invoice-control-lines-mobile')
const end = panel.indexOf('hidden md:block', start)
const mobile = panel.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('beskrivelse ombrydes', mobile.includes('text-gray-900 break-words min-w-0'), true)
eq('status bliver paa linjen', mobile.includes('shrink-0'), true)
eq('match kan brydes', mobile.includes('text-gray-600 break-all'), true)
eq('forventet pris bliver', mobile.includes('expectedUnitPrice'), true)
eq('ukontrollerbar bliver', mobile.includes('not_controllable'), true)
eq('overpris-tallet ligger ikke i kortet', mobile.includes('invoice-control-overcharge'), false)
eq('0-kr-saetningen bliver', panel.includes('Det tælles ikke som 0 kr.'), true)
eq('hovedtallet bliver', panel.includes('headerLineSummary(res.header)'), true)
eq('dommen kan ombrydes', panel.includes('flex flex-wrap items-start justify-between gap-2'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-control-wrap-test OK')
process.exitCode = fail ? 1 : 0
