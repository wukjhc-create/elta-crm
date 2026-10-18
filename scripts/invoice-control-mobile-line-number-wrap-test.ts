/**
 * Linjenummeret på fakturakontrollens mobilkort kan krympe. Nummeret og punktummet er uændret.
 *   npx tsx scripts/invoice-control-mobile-line-number-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('invoice-control-lines-mobile')
const end = view.indexOf('hidden md:block', start)
const mobile = start >= 0 && end > start ? view.slice(start, end) : ''
const at = mobile.indexOf('data-testid="invoice-control-mobile-line-number"')
const row = at >= 0 ? mobile.slice(at - 80, at + 90) : ''
ok(row.includes('break-words min-w-0'), 'mobilnummeret kan krympe')
ok(row.includes('{l.lineNumber}.'), 'nummer og punktum er uændret')
const deskStart = view.indexOf('hidden md:block overflow-x-auto')
const desk = deskStart >= 0 ? view.slice(deskStart, view.indexOf('invoice-control-tolerance', deskStart)) : ''
ok(desk.includes('data-testid="invoice-control-desktop-line-number"'), 'skrivebordsnummeret bliver')
ok(!desk.includes('{l.lineNumber}.'), 'skrivebordet har ikke punktum')
ok(mobile.includes('shrink-0'), 'linjedommen bliver på rækken')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'nummeret klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-mobile-line-number-wrap-test')
