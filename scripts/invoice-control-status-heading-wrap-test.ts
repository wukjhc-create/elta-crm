/**
 * Kolonneoverskriften Status ombrydes. Ordet er uændret.
 *   npx tsx scripts/invoice-control-status-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const at = view.indexOf('data-testid="invoice-control-col-status"')
const row = at >= 0 ? view.slice(at - 50, at + 70) : ''
ok(row.includes('pl-4 break-words min-w-0'), 'Status ombrydes')
ok(row.includes('>Status<'), 'ordet Status er uændret')
ok(view.includes('data-testid="invoice-control-desktop-verdict"'), 'linjedommen bliver')
ok(view.includes('data-testid="invoice-control-desktop-line-number"'), 'linjenummeret bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-status-heading-wrap-test')
