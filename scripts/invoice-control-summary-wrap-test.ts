/** Fakturakontrollens overpris og daekning ombrydes. kr() og 0-kr-saetningen bliver. Koer: npx tsx scripts/invoice-control-summary-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
const start = src.indexOf('grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3 break-words min-w-0')
const end = src.indexOf('invoice-control-lines-mobile', start)
const grid = src.slice(start, end)
eq('gitteret findes', start > 0 && end > start, true)
eq('celle kan krympe', grid.split('className="min-w-0"').length === 1, true)
eq('daekning ombrydes', grid.includes('font-medium break-words min-w-0">{res.control.controlledLines}'), true)
eq('overpris ombrydes', grid.includes('font-medium break-words ${'), true)
eq('overpris-testid bliver', grid.includes('data-testid="invoice-control-overcharge"'), true)
eq('kr bliver', grid.includes('kr(res.control.overchargeAmount)'), true)
eq('0-kr-saetningen bliver', grid.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), true)
eq('tom kontrol bliver', grid.includes('res.control.controlledLines > 0 ? kr(res.control.overchargeAmount) :'), true)
const sup = grid.indexOf("res.hasSupplier ? 'Kendt'")
eq('leverandoer ombrydes', sup > 0 && grid.slice(sup - 40, sup).includes('break-words'), true)
const mobile = src.slice(src.indexOf('invoice-control-lines-mobile'), src.indexOf('hidden md:block'))
eq('overpris ligger ikke i kortet', mobile.includes('invoice-control-overcharge'), false)
eq('linjestatus bliver', mobile.includes('shrink-0'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ninvoice-control-summary-wrap-test OK')
process.exitCode = fail ? 1 : 0
