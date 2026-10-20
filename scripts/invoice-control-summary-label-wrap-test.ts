/**
 * Etiketterne Kontrollerede linjer, Overpris i alt og Leverandør ombrydes.
 * Ordene og beløbene er uændret.
 *   npx tsx scripts/invoice-control-summary-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3 break-words min-w-0')
const end = view.indexOf('invoice-control-lines-mobile', start)
const grid = start >= 0 && end > start ? view.slice(start, end) : ''

const check = (id: string, words: string) => {
  const at = grid.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? grid.slice(at - 50, at + 80) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(`>${words}<`), `${words} er uændret`)
  ok(!row.includes(' truncate') && !row.includes('truncate '), `${id} klippes ikke`)
}

check('invoice-control-label-controlled', 'Kontrollerede linjer')
check('invoice-control-label-overcharge', 'Overpris i alt')
check('invoice-control-label-supplier', 'Leverandør')
ok(grid.includes('kr(res.control.overchargeAmount)'), 'overprisbeløbet er uændret')
ok(grid.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')
ok(grid.includes("{res.control.controlledLines} / {res.control.totalLines}"), 'dækningen er uændret')
ok(grid.split('className="min-w-0"').length === 3, 'de andre celler bliver bare')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-summary-label-wrap-test')
