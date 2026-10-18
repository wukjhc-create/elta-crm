/**
 * Fejlen under fakturakontrollen ombrydes. Den tælles ikke som et grønt stemmer.
 *   npx tsx scripts/invoice-control-load-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="invoice-control-load-error"')
const row = start >= 0 ? view.slice(start - 40, start + 140) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('{error}. Det tælles ikke som at priserne stemmer.'), 'sætningen er uændret')
ok(!row.includes('truncate'), 'fejlen klippes ikke')
ok(view.includes('min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800'), 'Prøv igen er høj nok')
ok(view.includes('data-testid="invoice-control-header"'), 'statuslinjen er uændret')
ok(view.includes('data-testid="invoice-control-overcharge"'), 'overprisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-load-error-wrap-test')
