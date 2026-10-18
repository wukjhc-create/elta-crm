/**
 * Kolonneoverskriften # kan krympe. Tegnet er uændret.
 *   npx tsx scripts/invoice-control-number-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const at = view.indexOf('data-testid="invoice-control-col-number"')
const row = at >= 0 ? view.slice(at - 40, at + 50) : ''
ok(row.includes('py-1 min-w-0'), 'overskriften kan krympe')
ok(row.includes('>#<'), 'tegnet er uændret')
ok(view.includes('data-testid="invoice-control-desktop-line-number"'), 'linjenummeret bliver')
ok(view.includes('{l.lineNumber}'), 'nummeret i cellen er uændret')
ok(view.includes('data-testid="invoice-control-col-description"'), 'Beskrivelse-overskriften bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-number-heading-wrap-test')
