/**
 * Kolonneoverskriften Beskrivelse ombrydes. Ordet er uændret.
 *   npx tsx scripts/invoice-control-description-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const at = view.indexOf('data-testid="invoice-control-col-description"')
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'Beskrivelse ombrydes')
ok(row.includes('>Beskrivelse<'), 'ordet Beskrivelse er uændret')
ok(view.includes('data-testid="invoice-control-desktop-description"'), 'beskrivelsescellen bliver')
ok(view.includes('{l.description}<ChargeMark description={l.description} />'), 'linjeteksten er uændret')
ok(view.includes('data-testid="invoice-control-col-status"'), 'Status-overskriften bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-description-heading-wrap-test')
