/**
 * "Kontrollerer priser…" ombrydes. Teksten er uændret.
 *   npx tsx scripts/invoice-control-loading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="invoice-control-loading"')
const row = start >= 0 ? view.slice(start - 80, start + 80) : ''
ok(row.includes('break-words min-w-0'), 'venteteksten ombrydes')
ok(row.includes('>Kontrollerer priser…</p>'), 'teksten er uændret')
ok(!row.includes('truncate'), 'venteteksten klippes ikke')
ok(view.includes('data-testid="invoice-control-verdict"'), 'dommen er uændret')
ok(view.includes('{error}. Det tælles ikke som at priserne stemmer.'), 'fejlen er uændret')
ok(view.includes('data-testid="invoice-control-overcharge"'), 'overprisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-loading-wrap-test')
