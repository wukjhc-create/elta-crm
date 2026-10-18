/**
 * Match-teksten på fakturakontrollens skrivebord ombrydes. Match-ordene er uændret.
 *   npx tsx scripts/invoice-control-match-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const method = view.slice(view.indexOf('const METHOD'), view.indexOf('function ChargeMark'))
for (const word of ["stored: 'linket vare'", "sku: 'varenr.'", "ean: 'EAN'", "description_sku: 'varenr. i tekst'"]) {
  ok(method.includes(word), `matchordet ${word} er uændret`)
}

const deskStart = view.indexOf('hidden md:block overflow-x-auto')
const desk = deskStart >= 0 ? view.slice(deskStart) : ''
const at = desk.indexOf('data-testid="invoice-control-desktop-match"')
const row = at >= 0 ? desk.slice(at - 40, at + 220) : ''
ok(row.includes('break-words min-w-0'), 'match-teksten ombrydes')
ok(row.includes('`${METHOD[m.method] ?? m.method}${m.productSku ? ` · ${m.productSku}` : \'\'}`'), 'match-udtrykket er uændret')
ok(row.includes("{l.reason ?? 'ingen'}"), 'manglende match siger stadig ingen')
ok(view.includes('text-gray-600 break-all'), 'mobilens match kan stadig brydes')
ok(view.includes('>Match</th>'), 'overskriften Match er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'match-teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-match-wrap-test')
