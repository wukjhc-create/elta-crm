/**
 * Kolonneoverskrifterne Forventet og Afvigelse ombrydes. Ordene er uændret.
 *   npx tsx scripts/invoice-control-column-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const expectedAt = view.indexOf('data-testid="invoice-control-col-expected"')
const expected = expectedAt >= 0 ? view.slice(expectedAt - 60, expectedAt + 70) : ''
ok(expected.includes('break-words min-w-0'), 'Forventet ombrydes')
ok(expected.includes('>Forventet<'), 'ordet Forventet er uændret')

const devAt = view.indexOf('data-testid="invoice-control-col-deviation"')
const dev = devAt >= 0 ? view.slice(devAt - 60, devAt + 70) : ''
ok(dev.includes('break-words min-w-0'), 'Afvigelse ombrydes')
ok(dev.includes('>Afvigelse<'), 'ordet Afvigelse er uændret')
ok(view.includes('>Match</th>') && view.includes('>Status</th>'), 'de andre overskrifter er uændret')
ok(view.includes('data-testid="invoice-control-desktop-expected"'), 'forventet beløb bliver')
ok(view.includes("l.verdict !== 'not_controllable'"), 'ukontrollerbar afvigelse bliver')
ok(!expected.includes(' truncate') && !expected.includes('truncate ') && !dev.includes(' truncate') && !dev.includes('truncate '), 'overskrifterne klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-column-wrap-test')
