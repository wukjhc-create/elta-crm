/** Dashboard-widgets ombryder navne. Beløb og tomme tekster er de samme. Koer: npx tsx scripts/dashboard-widget-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

function read(file: string) {
  return fs.readFileSync(`src/components/modules/dashboard/${file}`, 'utf8')
}

const due = read('incoming-invoice-due-widget.tsx')
const economy = read('invoice-economy-section.tsx')
const prices = read('price-alerts-widget.tsx')
const conversion = read('offer-conversion-widget.tsx')
const outstanding = read('outstanding-portfolio-widget.tsx')
const tasks = read('upcoming-tasks.tsx')
const offers = read('pending-offers.tsx')
const activity = read('recent-activity.tsx')

eq('forfald ombryder leverandør', due.includes('break-words min-w-0 text-gray-700') && due.includes('t.supplier_name'), true)
eq('forfald viser beløb', due.includes('kr(t.amount)'), true)
eq('forfald tom tekst bliver', due.includes('Ingen godkendte leverandørfakturaer forfalder lige nu.'), true)
eq('forfald er intern', due.includes('kun for fakturagodkendelse'), true)
eq('forfald klipper ikke', due.includes('truncate'), false)

eq('økonomi ombryder kunde', economy.includes('text-[11px] text-gray-500 break-words'), true)
eq('økonomi ombryder hændelse', economy.includes('text-sm text-gray-800 break-words'), true)
eq('økonomi viser inkl moms', economy.includes('kr(e.amount_incl_vat)'), true)
eq('økonomi viser fakturabeløb', economy.includes('kr(r.final_amount, r.currency)'), true)
eq('økonomi tom forfald bliver', economy.includes('Der er ingen forfaldne fakturaer lige nu.'), true)
eq('økonomi klipper ikke', economy.includes('truncate'), false)

eq('prisadvarsel ombryder vare', prices.includes('break-words min-w-0 flex-1 text-gray-700">{alert.product_name}'), true)
eq('prisadvarsel viser procent', prices.includes('alert.change_percentage.toFixed(1)'), true)
eq('prisadvarsel klipper ikke', prices.includes('truncate'), false)

eq('konvertering ombryder kunde', conversion.includes('break-words min-w-0">{data.latest_ready.customer_name'), true)
eq('konvertering viser beløb', conversion.includes('formatCurrency(data.latest_ready.amount'), true)
eq('konvertering klipper ikke', conversion.includes('truncate'), false)

eq('udestående ombryder sag', outstanding.includes('break-words min-w-0 text-gray-700') && outstanding.includes('t.title'), true)
eq('udestående viser beløb', outstanding.includes('kr(t.outstanding)'), true)
eq('udestående holder kost ude', outstanding.includes('ingen intern kost, margin eller dækningsbidrag'), true)
eq('udestående klipper ikke', outstanding.includes('truncate'), false)

eq('opgave ombryder titel', tasks.includes('font-medium text-sm break-words">{task.title}'), true)
eq('opgave klipper ikke', tasks.includes('truncate'), false)
eq('tilbud ombryder kunde', offers.includes('text-xs text-muted-foreground break-words') && offers.includes('offer.customer_name'), true)
eq('tilbud viser beløb', offers.includes('formatCurrency(offer.total_amount)'), true)
eq('aktivitet ombryder titel', activity.includes('text-sm text-muted-foreground break-words'), true)
eq('aktivitet ombryder handling', activity.includes('text-sm font-medium break-words">{activity.action}'), true)
eq('aktivitet klipper ikke', activity.includes('truncate'), false)
eq('tom aktivitet siger naeste skridt', activity.includes('Leads, kunder, tilbud og sager vises her, når de oprettes.'), true)

console.log(fail ? `\n${fail} fejl` : '\ndashboard-widget-wrap-test OK')
process.exitCode = fail ? 1 : 0
