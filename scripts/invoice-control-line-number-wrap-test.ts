/**
 * Linjenummeret på fakturakontrollens skrivebord ombrydes. Nummeret er uændret.
 *   npx tsx scripts/invoice-control-line-number-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const deskStart = view.indexOf('hidden md:block overflow-x-auto')
const deskEnd = view.indexOf('invoice-control-tolerance', deskStart)
const desk = deskStart >= 0 && deskEnd > deskStart ? view.slice(deskStart, deskEnd) : ''
const at = desk.indexOf('data-testid="invoice-control-desktop-line-number"')
const row = at >= 0 ? desk.slice(at - 60, at + 80) : ''
ok(row.includes('py-1 break-words min-w-0'), 'linjenummeret ombrydes')
ok(row.includes('{l.lineNumber}'), 'nummeret er uændret')
ok(!row.includes('{l.lineNumber}.'), 'skrivebordet tilføjer ikke et punktum')
ok(view.includes('{l.lineNumber}.'), 'mobilens nummer bliver')
ok(view.includes('data-testid="invoice-control-desktop-description"'), 'beskrivelsen bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'nummeret klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-line-number-wrap-test')
