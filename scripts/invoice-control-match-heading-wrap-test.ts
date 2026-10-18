/**
 * Kolonneoverskriften Match ombrydes. Ordet er uændret.
 *   npx tsx scripts/invoice-control-match-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const at = view.indexOf('data-testid="invoice-control-col-match"')
const row = at >= 0 ? view.slice(at - 50, at + 60) : ''
ok(row.includes('break-words min-w-0'), 'Match ombrydes')
ok(row.includes('>Match<'), 'ordet Match er uændret')
ok(view.includes('data-testid="invoice-control-desktop-match"'), 'match-cellen bliver')
ok(view.includes("stored: 'linket vare'"), 'match-ordene er uændret')
ok(view.includes('data-testid="invoice-control-col-expected"') && view.includes('data-testid="invoice-control-col-deviation"'), 'de andre kolonner bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-match-heading-wrap-test')
