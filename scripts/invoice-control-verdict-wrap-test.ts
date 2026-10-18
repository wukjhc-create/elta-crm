/**
 * Dom-mærket ombrydes. De fire domme er uændret.
 *   npx tsx scripts/invoice-control-verdict-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="invoice-control-verdict"')
const row = start >= 0 ? view.slice(start - 130, start + 70) : ''
ok(row.includes('break-words min-w-0'), 'dommen ombrydes')
ok(row.includes('{v.label}'), 'dommen kommer fra de fire tekster')
ok(!row.includes('shrink-0'), 'dommen kan blive smallere')
ok(!row.includes('truncate'), 'dommen klippes ikke')
ok(view.includes("ok: { label: 'Priser stemmer'"), 'stemmer er uændret')
ok(view.includes("deviation: { label: 'Prisafvigelse'"), 'afvigelse er uændret')
ok(view.includes("partially_controlled: { label: 'Delvist kontrolleret'"), 'delvist er uændret')
ok(view.includes("not_controllable: { label: 'Kan ikke kontrolleres'"), 'ukontrolleret er uændret')
ok(view.includes('data-testid="invoice-control-load-error"'), 'fejlen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-verdict-wrap-test')
